import { AudioMarker, IAudioToolkitModuleUsingMarker } from "../../components/ModuleUsingMarker";
import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import EssentiaModule, { EssentiaModuleSharableData } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./BeatTrackerDegaraComponent";

export interface EssentiaState {
    minTempo: number;
    maxTempo: number;
    channel: number;
}

export interface State extends AudioToolkitModuleState, EssentiaState {
    color: string;
    data: AudioMarker[] | undefined;
}

class Module extends EssentiaModule<State, EssentiaState, Float32Array[]> implements IAudioToolkitModuleUsingMarker {
    static MODULE_ID = "essentia.beattrackerdegara";
    static MODULE_NAME = "Essentia BeatTrackerDegara";
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
        const sharedState = sharableData?.[this.MODULE_ID]?.state;
        const state: State = { ...this.DEFAULT_STATE, ...initialState };
        const needCalculate = !sharedState || !Object.keys(this.DEFAULT_ESSENTIA_STATE).every(k => (sharedState as any)[k] === (state as any)[k]);
        const timeDomainVectors = await super.getTimeDomainVectors(audioEditor, sharableData);
        const module = new Module(audioEditor, timeDomainVectors, state);
        if (!state.data || needCalculate) {
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
    setMarkerPosition(markerIndex: number, position: number | [number, number]) {
        if (!this.state.data) return;
        if (typeof position !== "number") {
            let [start, end] = position;
            end = Math.min(this.audioEditor.length, end);
            start = Math.max(0, start);
            if (start > end) position = [end, start];
            else position = [start, end];
        } else {
            position = Math.max(0, Math.min(this.audioEditor.length, position));
        }
        const data = this.state.data.slice();
        data[markerIndex] = { ...data[markerIndex], position };
        this.setState({ ...this.state, data });
    }
    getMarkersFromRange(range: [number, number]) {
        if (!this.state.data) return [];
        const [from, to] = range;
        const indexes: number[] = [];
        this.state.data.forEach((m, i) => {
            if (typeof m.position === "number") {
                if (from <= m.position && m.position <= to) indexes.push(i);
                return;
            }
            const [f, t] = m.position;
            if (t <= to && f >= from) indexes.push(i);
        });
        return indexes.sort((a, b) => a - b);
    }
    addMarker(position: number | [number, number], name = "", color = this.state.color) {
        if (!this.state.data) return;
        const data = this.state.data.slice();
        data.push({ position, name, color });
        this.setState({ ...this.state, data });
    }
    deleteMarker(...markerIndexes: number[]) {
        if (!this.state.data) return;
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.sort((a, b) => b - a).forEach(index => data.splice(index, 1));
        this.setState({ ...this.state, data });
    }
    setMarkerName(name: string, ...markerIndexes: number[]) {
        if (!this.state.data) return;
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.forEach(index => data[index] = { ...data[index], name });
        this.setState({ ...this.state, data });
    }
    setMarkerClassName(name: string) {
        this.setState({ ...this.state, name });
    }
    setMarkerColor(color: string, ...markerIndexes: number[]) {
        if (!this.state.data) return;
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.forEach(index => data[index] = { ...data[index], color });
        this.setState({ ...this.state, data });
    }
    calculate() {
        this.handleCalculate(async (onUpdate) => {
            onUpdate(0, "Calculating channel 1");
            const { timeDomainVectors, essentiaWorker } = this;
            const { sampleRate } = this.audioEditor;
            const { minTempo, maxTempo, channel, color } = this.state;
            this._dataSlices = [];
            const data: AudioMarker[] = [];
            const { ticks } = await essentiaWorker.BeatTrackerDegara(timeDomainVectors[channel - 1], maxTempo, minTempo);
            const dataSlice = await essentiaWorker.vectorToArray(ticks);
            this._dataSlices = [dataSlice];
            for (let i = 0; i < dataSlice.length; i++) {
                const seconds = dataSlice[i];
                data[i] = { position: seconds * sampleRate, name: "", color };
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
