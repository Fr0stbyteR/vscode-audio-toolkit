import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import EssentiaModule, { EssentiaModuleSharableData, EssentiaVectorDataSlice } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./PitchYinProbabilisticComponent";

export interface EssentiaState {
    frameSize: number;
    hopSize: number;
    lowRMSThreshold: number;
    outputUnvoiced: "zero" | "abs" | "negative";
    preciseTime: boolean;
}

export interface State extends AudioToolkitModuleState, EssentiaState {
    color: string;
    probabilitiesColor: string;
    paintThreshold: number;
    paintProbabilities: boolean;
}

export interface DataSlice {
    pitch: EssentiaVectorDataSlice;
    voicedProbabilities: EssentiaVectorDataSlice;
}

class Module extends EssentiaModule<State, EssentiaState, DataSlice[]> {
    static MODULE_ID = "essentia.pitchyinprobabilistic";
    static MODULE_NAME = "Essentia PitchYinProbabilistic";
    static DEFAULT_ESSENTIA_STATE: EssentiaState = {
        frameSize: 2048,
        hopSize: 256,
        lowRMSThreshold: 0.1,
        outputUnvoiced: "negative",
        preciseTime: false
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_ESSENTIA_STATE,
        color: "#FFFFFF",
        probabilitiesColor: "#888888",
        paintThreshold: 0.25,
        paintProbabilities: true
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, EssentiaModuleSharableData<DataSlice[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const state: State = { ...this.DEFAULT_STATE, ...initialState };
        const timeDomainVectors = await super.getTimeDomainVectors(audioEditor, sharableData);
        const module = new Module(audioEditor, timeDomainVectors, state);
        if (sharableData?.[this.MODULE_ID]?.dataSlices) {
            module._dataSlices = [...sharableData[this.MODULE_ID].dataSlices];
        } else {
            module.calculate();
        }
        return module;
    }
    get Component() {
        return Component;
    }
    private constructor(
        public audioEditor: AudioEditor,
        protected timeDomainVectors: EssentiaPointer[],
        initialState: State
    ) {
        super(audioEditor, timeDomainVectors);
        this.state = initialState;
    }
    calculate() {
        this.handleCalculate(async (onUpdate) => {
            onUpdate(0, "Calculating channel 1");
            const { timeDomainVectors, essentiaWorker } = this;
            const { sampleRate, length, numberOfChannels } = this.audioEditor;
            const { hopSize, frameSize, lowRMSThreshold, outputUnvoiced, preciseTime } = this.state;
            const pitchVectors: Float32Array[] = [];
            const pitchVectorsPointer: EssentiaPointer[] = [];
            const probVectors: Float32Array[] = [];
            const probVectorsPointer: EssentiaPointer[] = [];
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const { pitch, voicedProbabilities } = await essentiaWorker.PitchYinProbabilistic(timeDomainVectors[channel], frameSize, hopSize, lowRMSThreshold, outputUnvoiced, preciseTime, sampleRate);
                pitchVectorsPointer[channel] = pitch;
                pitchVectors[channel] = await essentiaWorker.vectorToArray(pitch);
                probVectorsPointer[channel] = voicedProbabilities;
                probVectors[channel] = await essentiaWorker.vectorToArray(voicedProbabilities);
                onUpdate(80 / numberOfChannels, channel === numberOfChannels - 1 ? "Generating image" : `Calculating channel ${channel + 2}`);
            }
            const audioSamplesPerSample = hopSize;
            const offsetFromSample = 0;
            let resizedVectors = await essentiaWorker.generateResizedVector(pitchVectors, audioSamplesPerSample);
            // resizedVectors.resizes.forEach(resize => resize.offsetFromFrame = offsetFromSample);
            const pitch: EssentiaVectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors: pitchVectors,
                vectorsPointer: pitchVectorsPointer,
                resizedVectors
            };
            resizedVectors = await essentiaWorker.generateResizedVector(probVectors, audioSamplesPerSample);
            const voicedProbabilities: EssentiaVectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors: probVectors,
                vectorsPointer: probVectorsPointer,
                resizedVectors
            };
            this._dataSlices = [{ pitch, voicedProbabilities }];
            onUpdate(20, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }
    getOptionsMetadata(): { [K in keyof State]: [string, ...any] } {
        return {
            name: ["Name"],
            frameSize: ["Frame Size (samples)", 1, 1],
            hopSize: ["Hop Size (samples)", 1, 1],
            lowRMSThreshold: ["Low RMS Threshold", 0.001, 0.001, 1],
            outputUnvoiced: ["Output unvoiced", "negative", "abs", "negative"],
            preciseTime: ["Precise Time"],
            color: ["Color"],
            paintThreshold: ["Paint Voiced Threshold", 0.01, 0.01, 1],
            paintProbabilities: ["Show Probabilities"],
            probabilitiesColor: ["Probabilities Color"]
        };
    }
}

export default Module;
