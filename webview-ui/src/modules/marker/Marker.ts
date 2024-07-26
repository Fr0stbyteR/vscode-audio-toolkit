import { AudioToolkitModule, AudioToolkitModuleState, FrequencyDomainChannelData, VisualizationOptions, VisualizationStyleOptions } from "../../core/AudioToolkitModule";
import MarkerComponent from "./MarkerComponent";
import { getRuler } from "../../utils";
import AudioEditor, { AudioEditorConfiguration } from "../../core/AudioEditor";

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
    static DEFAULT_STATE = {};
    static async fromAudioData(audioEditor: AudioEditor, { name = "", data = [], color = "#ff0000" }: Partial<MarkerState> = {}, sharableData?: undefined) {
        const marker = new Marker(audioEditor, { name, data, color });
        return marker;
    }
    public moduleId = Marker.MODULE_ID;
    public Component = MarkerComponent;
    public state: MarkerState;
    public onStateChange: ((newState: MarkerState) => any) | undefined;
    private constructor(
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
    async paintVerticalRuler(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, gridLabels = true }: Partial<MarkerDrawOptions>,
        { viewRange, configuration: { audioUnit, beatsPerMeasure, beatsPerMinute, division } }: Pick<VisualizationOptions<this>, "viewRange" | "configuration">,
        { gridColor = "rgb(0, 53, 0)", gridRulerColor = "white", textColor = "white", labelFont = 'Consolas, "Courier New", "SF Mono", Monaco, Menlo, Courier, monospace' }: Partial<Pick<VisualizationStyleOptions, "gridColor" | "gridRulerColor" | "textColor" | "labelFont">> = {}
    ) {
        const { sampleRate } = this.audioEditor;
        const { ruler } = getRuler(viewRange, audioUnit, { sampleRate, beatsPerMeasure, beatsPerMinute, division });
        ctx.clearRect(0, 0, width, height);
        const top = gridLabels ? 40 : 0;
        const [$drawFrom, $drawTo] = viewRange;
        const pixelsPerSample = width / ($drawTo - $drawFrom);
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        let x: number;
        let y: number;
        for (const $str in ruler) {
            x = (+$str - $drawFrom) * pixelsPerSample;
            ctx.moveTo(x, top);
            ctx.lineTo(x, height);
        }
        ctx.stroke();
        if (!gridLabels) return;
        ctx.strokeStyle = gridRulerColor;
        ctx.fillStyle = textColor;
        ctx.font = `12px ${labelFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(audioUnit === "time" ? "hms" : audioUnit === "measure" ? `${beatsPerMinute} bpm` : "samps", 2, top - 14);
        ctx.textAlign = "center";
        ctx.beginPath();
        let text: string;
        for (const $str in ruler) {
            text = ruler[$str];
            x = (+$str - $drawFrom) * pixelsPerSample;
            y = text ? top - 10 : top - 5;
            ctx.moveTo(x, y);
            ctx.lineTo(x, top);
            if (text) ctx.fillText(text, x, y - 4);
        }
        ctx.stroke();
    }
}

export default Marker;
