import { AudioMarker, IAudioToolkitModuleUsingMarker } from "../../components/ModuleUsingMarker";
import AudioEditor from "../../core/AudioEditor";
import { EssentiaModuleSharableData } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./BeatTrackerDegaraComponent";
import EssentiaModuleUsingMarker, { EssentiaModuleUsingMarkerState } from "./EssentiaModuleUsingMarker";

export interface EssentiaState {
    minTempo: number;
    maxTempo: number;
    channel: number;
}

export interface State extends EssentiaModuleUsingMarkerState, EssentiaState {
}

class Module extends EssentiaModuleUsingMarker<State, EssentiaState, [{ ticks: Float32Array; confidence: number }]> implements IAudioToolkitModuleUsingMarker {
    static MODULE_ID = "essentia.beattrackermultifeature";
    static MODULE_NAME = "Essentia BeatTrackerMultiFeature";
    static DEFAULT_ESSENTIA_STATE: EssentiaState = {
        minTempo: 40,
        maxTempo: 208,
        channel: 1
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_ESSENTIA_STATE,
        color: "#FF8888",
        data: undefined
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, EssentiaModuleSharableData<Float32Array[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const sharedState: State = sharableData?.[this.MODULE_ID]?.state;
        const state: State = { ...this.DEFAULT_STATE, ...initialState };
        const dataShared = sharedState?.data && Object.keys(this.DEFAULT_ESSENTIA_STATE).every(k => (sharedState as any)[k] === (state as any)[k]);
        if (dataShared) state.data = sharedState.data;
        const timeDomainVectors = await super.getTimeDomainVectors(audioEditor, sharableData);
        const module = new Module(audioEditor, timeDomainVectors, state);
        if (!state.data) {
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
            const { sampleRate } = this.audioEditor;
            const { minTempo, maxTempo, channel, color } = this.state;
            const data: AudioMarker[] = [];
            const { ticks, confidence } = await essentiaWorker.BeatTrackerMultiFeature(timeDomainVectors[channel - 1], maxTempo, minTempo);
            const dataSlice = await essentiaWorker.vectorToArray(ticks);
            this._dataSlices = [{ ticks: dataSlice, confidence }];
            for (let i = 0; i < dataSlice.length; i++) {
                const seconds = dataSlice[i];
                data[i] = { position: seconds * sampleRate, name: i === 0 ? confidence.toFixed(3) : "", color };
            }
            onUpdate(100, "Done");
            this.setState({ ...this.state, data });
            this.onDataChange?.(this._dataSlices);
        });
    }
    setState(newState: State) {
        const { color } = newState;
        const needChangeColor = color !== this.state.color;
        super.setState(newState);
        if (needChangeColor && this.state.data) {
            this.setMarkerColor(color, ...Object.keys(this.state.data).map(v => +v));
        }
    }
    getOptionsMetadata(): { [K in keyof State]: [string, ...any] } {
        return {
            name: ["Name"],
            minTempo: ["the slowest tempo to detect (bpm)", 40, 1, 180],
            maxTempo: ["the fastest tempo to detect (bpm)", 60, 1, 250],
            channel: ["Channel to process", 1, 1, this.audioEditor.numberOfChannels],
            color: ["Default color"],
            data: ["Markers Data"],
        };
    }
}

export default Module;
