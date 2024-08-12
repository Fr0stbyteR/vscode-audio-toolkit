import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import EssentiaModule, { EssentiaModuleSharableData, EssentiaVectorDataSlice } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import PitchMelodia from "./PitchMelodia";
import Component from "./VibratoComponent";
import PitchYinProbabilistic from "./PitchYinProbabilistic";
import PredominantPitchMelodia from "./PredominantPitchMelodia";

export interface EssentiaState {
    minExtend: number;
    maxExtend: number;
    minFrequency: number;
    maxFrequency: number;
}

export interface State extends AudioToolkitModuleState, EssentiaState {
    color: string;
    paintOption: "frequency" | "extend";
}

export interface DataSlice {
    vibratoFrequency: EssentiaVectorDataSlice;
    vibratoExtend: EssentiaVectorDataSlice;
}

class Module extends EssentiaModule<State, EssentiaState, DataSlice[]> {
    static MODULE_ID = "essentia.vibrato";
    static MODULE_NAME = "Essentia Vibrato";
    static DEFAULT_ESSENTIA_STATE: EssentiaState = {
        minFrequency: 4,
        maxFrequency: 8,
        minExtend: 50,
        maxExtend: 250
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_ESSENTIA_STATE,
        color: "#FFFFFF",
        paintOption: "extend"
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, EssentiaModuleSharableData<DataSlice[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const dataSlices = sharableData?.[this.MODULE_ID]?.dataSlices;
        const sharedState = sharableData?.[this.MODULE_ID]?.state;
        const state: State = { ...this.DEFAULT_STATE, ...initialState };
        const needCalculate = !sharedState || !Object.keys(this.DEFAULT_ESSENTIA_STATE).every(k => (sharedState as any)[k] === (state as any)[k]);
        const timeDomainVectors = await super.getTimeDomainVectors(audioEditor, sharableData);
        const module = new Module(audioEditor, timeDomainVectors, state);
        if (dataSlices && !needCalculate) {
            module._dataSlices = [...dataSlices];
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
            const { sampleRate, numberOfChannels } = this.audioEditor;
            const sharableData = this.audioEditor.getSharableData();
            const dss = (sharableData[PitchMelodia.MODULE_ID]?.dataSlices ?? sharableData[PredominantPitchMelodia.MODULE_ID]?.dataSlices ?? sharableData[PitchYinProbabilistic.MODULE_ID]?.dataSlices) as { pitch: EssentiaVectorDataSlice }[] | undefined;
            if (!dss?.length || !dss[0].pitch) {
                throw new Error("Please add an essentia pitch analysis module, then recalculate");
            }
            this._dataSlices = [];
            for (let i = 0; i < dss.length; i++) {
                const ds = dss[i];
                const { pitch } = ds;
                const { minFrequency, maxFrequency, minExtend, maxExtend } = this.state;
                const vibratoExtendVectors: Float32Array[] = [];
                const vibratoExtendVectorsPointer: EssentiaPointer[] = [];
                const vibratoFrequencyVectors: Float32Array[] = [];
                const vibratoFrequencyVectorsPointer: EssentiaPointer[] = [];
                for (let channel = 0; channel < numberOfChannels; channel++) {
                    const { vibratoExtend, vibratoFrequency } = await essentiaWorker.Vibrato(pitch.vectorsPointer[channel], maxExtend, maxFrequency, minExtend, minFrequency, sampleRate / pitch.audioSamplesPerSample);
                    vibratoExtendVectorsPointer[channel] = vibratoExtend;
                    vibratoFrequencyVectorsPointer[channel] = vibratoFrequency;
                    vibratoExtendVectors[channel] = await essentiaWorker.vectorToArray(vibratoExtend);
                    vibratoFrequencyVectors[channel] = await essentiaWorker.vectorToArray(vibratoFrequency);
                    onUpdate(80 / numberOfChannels / dss.length, channel === numberOfChannels - 1 ? "Generating image" : `Calculating channel ${channel + 2}`);
                }
                let resizedVectors = await essentiaWorker.generateResizedVector(vibratoExtendVectorsPointer, pitch.audioSamplesPerSample);
                // resizedVectors.resizes.forEach(resize => resize.offsetFromFrame = offsetFromSample);
                const vibratoExtend: EssentiaVectorDataSlice = {
                    ...pitch,
                    vectors: vibratoExtendVectors,
                    resizedVectors
                };
                resizedVectors = await essentiaWorker.generateResizedVector(vibratoFrequencyVectorsPointer, pitch.audioSamplesPerSample);
                const vibratoFrequency: EssentiaVectorDataSlice = {
                    ...pitch,
                    vectors: vibratoFrequencyVectors,
                    resizedVectors
                };
                this._dataSlices[i] = { vibratoExtend, vibratoFrequency };
            }
            onUpdate(20, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }
    getOptionsMetadata(): { [K in keyof State]: [string, ...any] } {
        return {
            name: ["Name"],
            minExtend: ["Minimum considered vibrato extent (cents)", 1, 1],
            maxExtend: ["Maximum considered vibrato extent (cents)", 1, 1],
            minFrequency: ["Minimum considered vibrato frequency (Hz)", 1, 1],
            maxFrequency: ["Maximum considered vibrato frequency (Hz)", 1, 1],
            color: ["Color"],
            paintOption: ["Paint Option", "frequency", "extend"]
        };
    }
}

export default Module;
