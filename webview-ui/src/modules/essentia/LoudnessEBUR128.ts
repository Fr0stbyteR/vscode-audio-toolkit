import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import VectorImageProcessor, { VectorDataSlice } from "../../core/VectorImageProcessor";
import EssentiaModule, { EssentiaModuleSharableData } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./LoudnessEBUR128Component";

export interface State extends AudioToolkitModuleState {
    hopSize: number;
    startAtZero: boolean;
    paintMomentaryLoudness: boolean;
    paintShortTermLoudness: boolean;
    paintIntegratedLoudness: boolean;
    momentaryLoudnessColor: string;
    shortTermLoudnessColor: string;
    integratedLoudnessColor: string;
}

export interface Data {
    momentaryLoudness: Float32Array;
    shortTermLoudness: Float32Array;
    integratedLoudness: number;
    loudnessRange: number;
}

export interface DataSlice extends Pick<Data, "loudnessRange"> {
    momentaryLoudnessDataSlice: VectorDataSlice;
    shortTermLoudnessDataSlice: VectorDataSlice;
    integratedLoudnessDataSlice: VectorDataSlice;
}

class Module extends EssentiaModule<State, DataSlice[]> {
    static MODULE_ID = "essentia.loudnessebur128";
    static MODULE_NAME = "Essentia LoudnessEBUR128";
    static DEFAULT_STATE: State = {
        name: "",
        hopSize: 0.1,
        startAtZero: false,
        paintMomentaryLoudness: true,
        paintShortTermLoudness: true,
        paintIntegratedLoudness: true,
        momentaryLoudnessColor: "#FF8888",
        shortTermLoudnessColor: "#88FF88",
        integratedLoudnessColor: "#8888FF"
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = this.DEFAULT_STATE, sharableData?: Record<string, EssentiaModuleSharableData<DataSlice[]>>) {
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
    declare onDataChange: ((data: DataSlice[]) => any) | undefined;
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
        const needCalculate = !this._dataSlices?.length || newState.hopSize !== this.state.hopSize || newState.startAtZero !== this.state.startAtZero;
        this.state = newState;
        this.onStateChange?.(newState);
        if (needCalculate) this.calculate();
    }
}

export default Module;
