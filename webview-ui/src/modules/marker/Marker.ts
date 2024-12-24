import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import MarkerComponent from "./MarkerComponent";
import AudioEditor from "../../core/AudioEditor";
import { AudioMarker, IAudioToolkitModuleUsingMarker } from "../../components/ModuleUsingMarker";

export interface MarkerState extends AudioToolkitModuleState {
    name: string;
    data: AudioMarker[];
}

class Marker implements IAudioToolkitModuleUsingMarker<MarkerState> {
    static MODULE_ID = "marker";
    static MODULE_NAME = "Marker";
    static DEFAULT_STATE: MarkerState = { name: "", data: [] };
    static async fromAudioData(audioEditor: AudioEditor, { name = this.DEFAULT_STATE.name, data = this.DEFAULT_STATE.data }: Partial<MarkerState> = this.DEFAULT_STATE, sharableData?: undefined) {
        const marker = new Marker(audioEditor, { name, data });
        return marker;
    }
    public moduleId = Marker.MODULE_ID;
    public Component = MarkerComponent;
    public state: MarkerState;
    public onStateChange: ((newState: MarkerState) => any) | undefined;
    protected constructor(
        public audioEditor: AudioEditor,
        initialState: MarkerState
    ) {
        this.state = initialState;
    }
    get sharableData() {
        return Promise.resolve(null);
    }

    getState() {
        return this.state;
    }
    setState(newState: MarkerState) {
        this.state = newState;
        this.onStateChange?.(newState);
    }
    setMarkerPosition(markerIndex: number, position: number | [number, number]) {
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
    addMarker(position: number | [number, number], name = "", color = "FF0000") {
        const data = this.state.data.slice();
        data.push({ position, name, color });
        this.setState({ ...this.state, data });
    }
    deleteMarker(...markerIndexes: number[]) {
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.sort((a, b) => b - a).forEach(index => data.splice(index, 1));
        this.setState({ ...this.state, data });
    }
    setMarkerName(name: string, ...markerIndexes: number[]) {
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.forEach(index => data[index] = { ...data[index], name });
        this.setState({ ...this.state, data });
    }
    setMarkerClassName(name: string) {
        this.setState({ ...this.state, name });
    }
    setMarkerColor(color: string, ...markerIndexes: number[]) {
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.forEach(index => data[index] = { ...data[index], color });
        this.setState({ ...this.state, data });
    }
}

export default Marker;
