import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import VectorImageProcessor, { VectorDataSlice } from "../../core/VectorImageProcessor";
import EssentiaModule, { EssentiaModuleSharableData } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./LevelExtractorComponent";

export interface State extends AudioToolkitModuleState {
    frameSize: number;
    hopSize: number;
    color: string;
}

class Module extends EssentiaModule<State, VectorDataSlice[]> {
    static MODULE_ID = "essentia.levelextractor";
    static MODULE_NAME = "Essentia LevelExtractor";
    static DEFAULT_STATE: State = {
        name: "",
        frameSize: 88200,
        hopSize: 44100,
        color: "#FFFFFF",
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = this.DEFAULT_STATE, sharableData?: Record<string, EssentiaModuleSharableData<VectorDataSlice[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const state: State = { ...this.DEFAULT_STATE, ...initialState, frameSize: 2 * audioEditor.sampleRate, hopSize: audioEditor.sampleRate };
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
    declare onDataChange: ((data: VectorDataSlice[]) => any) | undefined;
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
        const needCalculate = !this._dataSlices?.length || newState.hopSize !== this.state.hopSize || newState.frameSize !== this.state.frameSize;
        this.state = newState;
        this.onStateChange?.(newState);
        if (needCalculate) this.calculate();
    }
}

export default Module;
