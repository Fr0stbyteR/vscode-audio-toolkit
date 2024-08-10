import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import { VectorDataSlice } from "../../core/VectorImageProcessor";
import EssentiaModule, { EssentiaModuleSharableData } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./LevelExtractorComponent";

export interface EssentiaState {
    frameSize: number;
    hopSize: number;
}

export interface State extends AudioToolkitModuleState, EssentiaState {
    color: string;
}

class Module extends EssentiaModule<State, VectorDataSlice[]> {
    static MODULE_ID = "essentia.levelextractor";
    static MODULE_NAME = "Essentia LevelExtractor";
    static DEFAULT_ESSENTIA_STATE: EssentiaState = {
        frameSize: 88200,
        hopSize: 44100,
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_ESSENTIA_STATE,
        color: "#FFFFFF"
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, EssentiaModuleSharableData<VectorDataSlice[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const state: State = { ...this.DEFAULT_STATE, frameSize: 2 * audioEditor.sampleRate, hopSize: audioEditor.sampleRate, ...initialState };
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
            onUpdate(0, "Calculating channel 1");
            const { timeDomainVectors, essentiaWorker } = this;
            const { sampleRate, length, numberOfChannels } = this.audioEditor;
            const { hopSize, frameSize } = this.state;
            const vectors: Float32Array[] = [];
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const { loudness } = await essentiaWorker.LevelExtractor(timeDomainVectors[channel], frameSize, hopSize);
                vectors[channel] = loudness;
                onUpdate(80 / numberOfChannels, channel === numberOfChannels - 1 ? "Generating image" : `Calculating channel ${channel + 2}`);
            }
            const audioSamplesPerSample = hopSize;
            const offsetFromSample = 0;
            const resizedVectors = await essentiaWorker.generateResizedVector(vectors, audioSamplesPerSample);
            // resizedVectors.resizes.forEach(resize => resize.offsetFromFrame = offsetFromSample);
            const dataSlice: VectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors,
                resizedVectors
            };
            this._dataSlices = [dataSlice];
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
            frameSize: ["Frame Size (samples)", 1, 1],
            hopSize: ["Hop Size (samples)", 1, 1],
            color: ["Color"],
        };
    }
}

export default Module;
