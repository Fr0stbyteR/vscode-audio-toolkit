import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import VectorImageProcessor, { VectorDataSlice } from "../../core/VectorImageProcessor";
import EssentiaModule, { EssentiaModuleSharableData } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./LoudnessEBUR128Component";

export interface EssentiaState {
    hopSize: number;
    startAtZero: boolean;
}

export interface State extends AudioToolkitModuleState, EssentiaState {
    paintMomentaryLoudness: boolean;
    paintShortTermLoudness: boolean;
    paintIntegratedLoudness: boolean;
    momentaryLoudnessColor: string;
    shortTermLoudnessColor: string;
    integratedLoudnessColor: string;
}

export interface DataSlice {
    momentaryLoudnessDataSlice: VectorDataSlice;
    shortTermLoudnessDataSlice: VectorDataSlice;
    integratedLoudnessDataSlice: VectorDataSlice;
    loudnessRange: number;
}

class Module extends EssentiaModule<State, DataSlice[]> {
    static MODULE_ID = "essentia.loudnessebur128";
    static MODULE_NAME = "Essentia LoudnessEBUR128";
    static DEFAULT_ESSENTIA_STATE: EssentiaState = {
        hopSize: 0.1,
        startAtZero: false
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_ESSENTIA_STATE,
        paintMomentaryLoudness: true,
        momentaryLoudnessColor: "#FF8888",
        paintShortTermLoudness: true,
        shortTermLoudnessColor: "#88FF88",
        paintIntegratedLoudness: true,
        integratedLoudnessColor: "#8888FF"
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, EssentiaModuleSharableData<DataSlice[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const state = { ...this.DEFAULT_STATE, ...initialState };
        const timeDomainVectors = await super.getTimeDomainVectors(audioEditor, sharableData);
        const module = new Module(audioEditor, timeDomainVectors, state);
        if (sharableData?.[this.MODULE_ID]?.dataSlices) {
            module._dataSlices = [...sharableData[this.MODULE_ID].dataSlices];
        } else {
            module.calculate();
        }
        return module;
    }
    static getEssentiaState(moduleState: State) {
        const state: Partial<EssentiaState> = {};
        Object.keys(Module.DEFAULT_ESSENTIA_STATE).forEach(k => (state as any)[k] = (moduleState as any)[k]);
        return state as EssentiaState;
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
            onUpdate(0, "Calculating...");
            const { timeDomainVectors, essentiaWorker } = this;
            const { sampleRate, length } = this.audioEditor;
            const { hopSize, startAtZero } = this.state;
            const { momentaryLoudness, shortTermLoudness, integratedLoudness, loudnessRange } = await essentiaWorker.LoudnessEBUR128(timeDomainVectors[0], timeDomainVectors[1] ?? timeDomainVectors[0], hopSize, sampleRate, startAtZero);
            const audioSamplesPerSample = sampleRate * hopSize;
            let offsetFromSample = startAtZero ? 0 : sampleRate * (hopSize - 0.4) * 0.5;
            let resizedVectors = await essentiaWorker.generateResizedVector([momentaryLoudness], audioSamplesPerSample);
            resizedVectors.resizes.forEach(resize => resize.offsetFromFrame = offsetFromSample);
            onUpdate(80 , "Generating image");
            const momentaryLoudnessDataSlice: VectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors: [momentaryLoudness],
                resizedVectors
            };
            offsetFromSample = startAtZero ? 0 : sampleRate * (hopSize - 3) * 0.5;
            resizedVectors = await essentiaWorker.generateResizedVector([shortTermLoudness], audioSamplesPerSample);
            resizedVectors.resizes.forEach(resize => resize.offsetFromFrame = offsetFromSample);
            const shortTermLoudnessDataSlice: VectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors: [shortTermLoudness],
                resizedVectors
            };
            const integratedLoudnessDataSlice: VectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample: 0,
                audioSamplesPerSample: length,
                vectors: [new Float32Array([integratedLoudness])],
                resizedVectors: { resizes: [], sizes: [], resizeOptions: { resizeFactor: VectorImageProcessor.DEFAULT_RESIZE_FACTOR, minWidth: VectorImageProcessor.DEFAULT_MIN_WIDTH } }
            };
            this._dataSlices = [{ momentaryLoudnessDataSlice, shortTermLoudnessDataSlice, integratedLoudnessDataSlice, loudnessRange }];
            onUpdate(20, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }
    getState() {
        return this.state;
    }
    setState(newState: State) {
        const needCalculate = !this._dataSlices?.length || !Object.keys(Module.DEFAULT_ESSENTIA_STATE).every(k => (newState as any)[k] === (this.state as any)[k]);
        this.state = newState;
        this.onStateChange?.(newState);
        if (needCalculate) this.calculate();
    }
    getOptionsMetadata(): { [K in keyof State]: [string, ...any] } {
        return {
            name: ["Name"],
            hopSize: ["Hop Size (sec)", 0.001, 0.001, 1],
            startAtZero: ["Start at zero"],
            paintMomentaryLoudness: ["Show momentary loudness"],
            momentaryLoudnessColor: ["Color"],
            paintShortTermLoudness: ["Show short-term loudness"],
            shortTermLoudnessColor: ["Color"],
            paintIntegratedLoudness: ["Show integrated loudness"],
            integratedLoudnessColor: ["Color"],
        };
    }
}

export default Module;
