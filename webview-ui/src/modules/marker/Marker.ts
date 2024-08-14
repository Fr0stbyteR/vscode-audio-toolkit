import { AudioToolkitModule, AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import MarkerComponent from "./MarkerComponent";
import AudioEditor from "../../core/AudioEditor";

export interface AudioMarker {
    position: number | [number, number];
    name: string;
}

export interface MarkerDrawOptions {
    width: number;
    height: number;
    gridLabels: boolean;
}

export interface MarkerState extends AudioToolkitModuleState {
    name: string;
    color: string;
    data: AudioMarker[];
}

class Marker implements AudioToolkitModule<MarkerState> {
    static MODULE_ID = "marker";
    static MODULE_NAME = "Marker";
    static DEFAULT_STATE: MarkerState = { name: "", data: [], color: "#ff0000" };
    static async fromAudioData(audioEditor: AudioEditor, { name = this.DEFAULT_STATE.name, data = this.DEFAULT_STATE.data, color = this.DEFAULT_STATE.color }: Partial<MarkerState> = this.DEFAULT_STATE, sharableData?: undefined) {
        const marker = new Marker(audioEditor, { name, data, color });
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
        this.state.data[markerIndex] = { ...this.state.data[markerIndex], position };
        this.setState({ ...this.state, data: this.state.data.slice() });
    }
    addMarker(position: number | [number, number], name = "") {
        this.state.data.push({ position, name });
        this.setState({ ...this.state, data: this.state.data.slice() });
    }
    deleteMarker(markerIndex: number) {
        this.state.data.splice(markerIndex, 1);
        this.setState({ ...this.state, data: this.state.data.slice() });
    }
    setMarkerName(markerIndex: number, name: string) {
        this.state.data[markerIndex] = { ...this.state.data[markerIndex], name };
        this.setState({ ...this.state, data: this.state.data.slice() });
    }
    setMarkerClassName(name: string) {
        this.setState({ ...this.state, name });
    }
    setMarkerColor(color: string) {
        this.setState({ ...this.state, color });
    }
    getSharableData() {
        return;
    }
}

export default Marker;
