import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import VectorImageProcessor, { VectorDataSlice } from "../../core/VectorImageProcessor";
import EssentiaModule, { EssentiaModuleSharableData } from "./EssentiaModule";

export interface State extends AudioToolkitModuleState {
    hopSize: number;
    startAtZero: boolean;
}

export interface Data {
    momentaryLoudness: Float32Array;
    shortTermLoudness: Float32Array;
    integratedLoudness: number;
    loudnessRange: number;
}

export interface DataSlice extends Pick<Data, "integratedLoudness" | "loudnessRange"> {
    momentaryLoudnessDataSlice: VectorDataSlice;
    shortTermLoudnessDataSlice: VectorDataSlice;
}

class Module extends EssentiaModule<State> {
    static MODULE_ID = "essentia.loadnessebur128";
    static MODULE_NAME = "LoudnessEBUR128";
    static DEFAULT_STATE: State = { name: "", hopSize: 0.1, startAtZero: false };
    static async fromAudioData(audioEditor: AudioEditor, { name = this.DEFAULT_STATE.name, hopSize = this.DEFAULT_STATE.hopSize, startAtZero = this.DEFAULT_STATE.startAtZero }: Partial<State> = this.DEFAULT_STATE, sharableData?: Record<string, EssentiaModuleSharableData>) {
        const timeDomainVectors = super.getTimeDomainVectors(audioEditor, sharableData);
        const module = new Module(audioEditor, timeDomainVectors, { name, hopSize, startAtZero });
        module.calculate();
        return module;
    }
    public state: State;
    private _dataSlices: DataSlice[] = [];
    get dataSlices() {
        return this._dataSlices;
    }

    private constructor(
        public audioEditor: AudioEditor,
        protected timeDomainVectors: number[],
        initialState: State
    ) {
        super(audioEditor, timeDomainVectors);
        this.state = initialState;
    }
    onDataChange: ((data: DataSlice[]) => any) | undefined;
    calculate() {
        setTimeout(() => {
            const { momentaryLoudness, shortTermLoudness, integratedLoudness, loudnessRange } = this.essentia.LoudnessEBUR128(this.timeDomainVectors[0], this.timeDomainVectors[1], this.state.hopSize, this.audioEditor.sampleRate, this.state.startAtZero) as ReturnType<this["essentia"]["LoudnessEBUR128"]>;
            const momentaryLoudnessArray = this.essentia.vectorToArray(momentaryLoudness);
            const shortTermLoudnessArray = this.essentia.vectorToArray(shortTermLoudness);
            const audioSamplesPerSample = this.audioEditor.sampleRate * this.state.hopSize;
            const momentaryLoudnessDataSlice: VectorDataSlice = {
                startIndex: 0,
                endIndex: this.audioEditor.length,
                offsetFromSample: 0,
                audioSamplesPerSample,
                vectors: [momentaryLoudnessArray],
                resizedVectors: VectorImageProcessor.generateResized([momentaryLoudnessArray], audioSamplesPerSample)
            };
            const shortTermLoudnessDataSlice: VectorDataSlice = {
                startIndex: 0,
                endIndex: this.audioEditor.length,
                offsetFromSample: 0,
                audioSamplesPerSample,
                vectors: [shortTermLoudnessArray],
                resizedVectors: VectorImageProcessor.generateResized([shortTermLoudnessArray], audioSamplesPerSample)
            };
            this._dataSlices = [{ momentaryLoudnessDataSlice, shortTermLoudnessDataSlice, integratedLoudness, loudnessRange }];
            this.onDataChange?.(this._dataSlices);
        }, 0);
    }
    getState() {
        return this.state;
    }
    setState(newState: State) {
        if (newState.hopSize !== this.state.hopSize || newState.startAtZero !== this.state.startAtZero) this.calculate();
        this.state = newState;
        this.onStateChange?.(newState);
    }
}

export default Module;
