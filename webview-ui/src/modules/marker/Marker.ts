import { AudioToolkitModule, AudioToolkitModuleState, FrequencyDomainChannelData, VisualizationOptions, VisualizationStyleOptions } from "../../core/AudioToolkitModule";
import MarkerComponent from "./MarkerComponent";
import { dbtoa, getRuler } from "../../utils";
import { AudioEditorConfiguration } from "../../core/AudioEditor";

export interface AudioMarker {
    position: number | [number, number];
    name: string;
}

export interface MarkerSliceData {
    startIndex: number;
    endIndex: number;
    markers: AudioMarker[];
}

export interface MarkerDrawOptions {
    width: number;
    height: number;
    gridLabels: boolean;
}

export interface MarkerState extends AudioToolkitModuleState {
    name: string;
    data: MarkerSliceData[];
}

class Marker implements AudioToolkitModule<MarkerState> {
    static MODULE_ID = "marker";
    static MODULE_NAME = "Marker";
    static DEFAULT_STATE = {};
    static async fromAudioData(timeDomainData: Float32Array[], _frequencyDomainData: FrequencyDomainChannelData[], sampleRate: number, _configuration: AudioEditorConfiguration, { name = "", data = [] }: Partial<MarkerState> = {}, sharableData?: undefined) {
        const marker = new Marker(timeDomainData, sampleRate, { name, data });
        return marker;
    }
    public moduleId = Marker.MODULE_ID;
    public Component = MarkerComponent;
    public state: MarkerState;
    public onStateChange: ((newState: MarkerState) => any) | undefined;
    get length() {
        return this.timeDomainData[0].length;
    }
    get numberOfChannels() {
        return this.timeDomainData.length;
    }
    private constructor(
        public timeDomainData: Float32Array[],
        public sampleRate: number,
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
    getSharableData() {
        return;
    }
    async paintVerticalRuler(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, gridLabels = true }: Partial<MarkerDrawOptions>,
        { viewRange, configuration: { audioUnit, beatsPerMeasure, beatsPerMinute, division } }: Pick<VisualizationOptions<this>, "viewRange" | "configuration">,
        { gridColor = "rgb(0, 53, 0)", gridRulerColor = "white", textColor = "white", labelFont = 'Consolas, "Courier New", "SF Mono", Monaco, Menlo, Courier, monospace' }: Partial<Pick<VisualizationStyleOptions, "gridColor" | "gridRulerColor" | "textColor" | "labelFont">> = {}
    ) {
        const { sampleRate } = this;
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
