import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import { VectorDataSlice } from "../../core/VectorImageProcessor";
import EssentiaModule, { EssentiaModuleSharableData } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./PitchYinProbabilisticComponent";

export interface State extends AudioToolkitModuleState {
    frameSize: number;
    hopSize: number;
    lowRMSThreshold: number;
    outputUnvoiced: "zero" | "abs" | "negative";
    preciseTime: boolean;
    color: string;
    probabilitiesColor: string;
    paintThreshold: number;
    paintProbabilities: boolean;
}

export interface DataSlice {
    pitch: VectorDataSlice;
    voicedProbabilities: VectorDataSlice;
}

class Module extends EssentiaModule<State, DataSlice[]> {
    static MODULE_ID = "essentia.pitchyinprobabilistic";
    static MODULE_NAME = "Essentia PitchYinProbabilistic";
    static DEFAULT_STATE: State = {
        name: "",
        frameSize: 2048,
        hopSize: 256,
        lowRMSThreshold: 0.1,
        outputUnvoiced: "negative",
        preciseTime: false,
        color: "#FFFFFF",
        probabilitiesColor: "#888888",
        paintThreshold: 0.25,
        paintProbabilities: true
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = this.DEFAULT_STATE, sharableData?: Record<string, EssentiaModuleSharableData<DataSlice[]>>) {
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
    public state: State;
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
            const probVectors: Float32Array[] = [];
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const { pitch, voicedProbabilities } = await essentiaWorker.PitchYinProbabilistic(timeDomainVectors[channel], frameSize, hopSize, lowRMSThreshold, outputUnvoiced, preciseTime, sampleRate);
                pitchVectors[channel] = pitch;
                probVectors[channel] = voicedProbabilities;
                onUpdate(80 / numberOfChannels, channel === numberOfChannels - 1 ? "Generating image" : `Calculating channel ${channel + 2}`);
            }
            const audioSamplesPerSample = hopSize;
            const offsetFromSample = 0;
            let resizedVectors = await essentiaWorker.generateResizedVector(pitchVectors, audioSamplesPerSample);
            // resizedVectors.resizes.forEach(resize => resize.offsetFromFrame = offsetFromSample);
            const pitch: VectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors: pitchVectors,
                resizedVectors
            };
            resizedVectors = await essentiaWorker.generateResizedVector(probVectors, audioSamplesPerSample);
            const voicedProbabilities: VectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors: probVectors,
                resizedVectors
            };
            this._dataSlices = [{ pitch, voicedProbabilities }];
            onUpdate(20, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }
    getState() {
        return this.state;
    }
    setState(newState: State) {
        const needCalculate = !this._dataSlices?.length || newState.hopSize !== this.state.hopSize || newState.frameSize !== this.state.frameSize || newState.lowRMSThreshold !== this.state.lowRMSThreshold || newState.outputUnvoiced !== this.state.outputUnvoiced || newState.preciseTime !== this.state.preciseTime;
        this.state = newState;
        this.onStateChange?.(newState);
        if (needCalculate) this.calculate();
    }
}

export default Module;
