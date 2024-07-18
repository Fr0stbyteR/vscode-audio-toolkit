import { convertSampleToUnit, dbtoa, normExp } from "../utils";
import WaveformWorker from "../workers/WaveformWorker";
import { AudioEditorConfiguration, AudioEditorState, AudioUnit, DrawOptions } from "./AudioEditor";

export interface WaveformResizeOptions {
    resizeFactor: number;
    minWidth: number;
}

export interface ResizedWaveform {
    offsetFromFrame: number;
    samplesPerPixel: number;
    minData: Float32Array[];
    maxData: Float32Array[];
}

export interface ResizedWaveforms {
    resizes: ResizedWaveform[];
    sizes: number[];
    resizeOptions: WaveformResizeOptions;
}

export interface WaveformSliceData {
    startIndex: number;
    endIndex: number;
    resizedWaveforms: ResizedWaveforms;
}

export interface WaveformPaintOptions {
    phosphorColor: string;
    separatorColor: string;
    cursorColor: string;
    gridColor: string;
    gridRulerColor: string;
    textColor: string;
    paintGridLabels: boolean;
    labelFont: string;
    fadePathColor: string;
    fadeInExp: number;
    fadeInTo: number;
    fadeOutExp: number;
    fadeOutFrom: number;
    fade: number;
}

export const getFactors = (n: number) => {
    const factors = [1];
    let i = 2;
    while (i < Math.sqrt(n)) {
        if (n % i === 0) factors.push(i, n / i);
        i++;
    }
    return factors.sort((a, b) => a - b);
};
export const getRuler = (range: [number, number], unit: AudioUnit, { sampleRate = 48000, beatsPerMinute = 60, beatsPerMeasure = 4, division = 16 }) => {
    const ruler: Record<number, string> = {};
    const length = range[1] - range[0];
    let coarse: number | undefined;
    let refined: number | undefined;
    if (unit === "sample") {
        const steps = [1, 2, 5];
        let mag = 1;
        let step = 0;
        do {
            const grid = steps[step] * mag;
            if (step + 1 < steps.length) {
                step++;
            } else {
                step = 0;
                mag *= 10;
            }
            if (!coarse && length / grid <= 10) coarse = grid;
            if (!refined && length / grid <= 50) refined = grid;
        } while (!coarse || !refined);
    } else if (unit === "measure") {
        const bps = beatsPerMinute / 60;
        const samplesPerBeat = sampleRate / bps;
        const divisionFactors = getFactors(division);
        const beatsFactors = getFactors(beatsPerMeasure);
        const measureFactors = [1, 2, 5];
        let actualUnit: "division" | "beat" | "measure" = "division";
        let mag = 1;
        let step = 0;
        do {
            const grid = actualUnit === "division"
                ? samplesPerBeat * divisionFactors[step] / division
                : actualUnit === "beat"
                    ? samplesPerBeat * beatsFactors[step]
                    : samplesPerBeat * measureFactors[step] * mag * beatsPerMeasure;
            if (actualUnit === "division") {
                if (step + 1 < divisionFactors.length) {
                    step++;
                } else {
                    actualUnit = "beat";
                    step = 0;
                }
            } else if (actualUnit === "beat") {
                if (step + 1 < beatsFactors.length) {
                    step++;
                } else {
                    actualUnit = "measure";
                    step = 0;
                }
            } else {
                if (step + 1 < measureFactors.length) {
                    step++;
                } else {
                    step = 0;
                    mag *= 10;
                }
            }
            if (!coarse && length / grid <= 10) coarse = grid;
            if (!refined && length / grid <= 50) refined = grid;
        } while (!coarse || !refined);
    } else {
        const msFactors = [1, 2, 5, 10, 20, 50, 100, 200, 500];
        const sFactors = getFactors(60);
        const minFactors = sFactors;
        const hFactors = [1, 2, 5];
        let actualUnit: "ms" | "s" | "min" | "h" = "ms";
        let mag = 1;
        let step = 0;
        do {
            const grid = actualUnit === "ms"
                ? sampleRate * msFactors[step] / 1000
                : actualUnit === "s"
                    ? sampleRate * sFactors[step]
                    : actualUnit === "min"
                        ? sampleRate * minFactors[step] * 60
                        : sampleRate * hFactors[step] * mag * 60;
            if (actualUnit === "ms") {
                if (step + 1 < msFactors.length) {
                    step++;
                } else {
                    actualUnit = "s";
                    step = 0;
                }
            } else if (actualUnit === "s") {
                if (step + 1 < sFactors.length) {
                    step++;
                } else {
                    actualUnit = "min";
                    step = 0;
                }
            } else if (actualUnit === "min") {
                if (step + 1 < minFactors.length) {
                    step++;
                } else {
                    actualUnit = "h";
                    step = 0;
                }
            } else {
                if (step + 1 < hFactors.length) {
                    step++;
                } else {
                    step = 0;
                    mag *= 10;
                }
            }
            if (!coarse && length / grid <= 10) coarse = grid;
            if (!refined && length / grid <= 50) refined = grid;
        } while (!coarse || !refined);
    }
    let m = ~~(range[0] / refined);
    if (m * refined < range[0]) m++;
    while (m * refined < range[1]) {
        const t = m * refined;
        if (t && t % coarse < 0.001 || coarse - t % coarse < 0.001) {
            ruler[t] = unit === "sample" ? t.toString() : convertSampleToUnit(t, unit, { sampleRate, beatsPerMinute, beatsPerMeasure, division }).str.replace(/\.[0.]+$/, "");
        } else {
            ruler[t] = "";
        }
        m++;
    }
    return { ruler, coarse, refined };
};

class Waveform {
    static async fromAudioData(audioData: Float32Array[], sampleRate: number) {
        const waveform = new Waveform(audioData, sampleRate);
        const resized = await waveform._worker.generateResized(audioData);
        waveform._dataSlices = [resized];
        return waveform;
    }

    private _worker = new WaveformWorker();
    private _dataSlices: WaveformSliceData[] = [];
    get length() {
        return this.audioData[0].length;
    }
    get numberOfChannels() {
        return this.audioData.length;
    }
    private constructor(
        public audioData: Float32Array[],
        public sampleRate: number
    ) {}

    getBestResizes(targetSamplesPerPixel: number) {
        return this._dataSlices.map((waveformSliceData) => {
            return waveformSliceData.resizedWaveforms.resizes.findLastIndex(({ samplesPerPixel }) => samplesPerPixel < targetSamplesPerPixel);
        });
    }

    async paintVerticalRuler(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0 }: Partial<DrawOptions>,
        { viewRange, audioUnit, beatsPerMeasure, beatsPerMinute, division }: Pick<AudioEditorState & AudioEditorConfiguration, "viewRange" | "audioUnit" | "beatsPerMeasure" | "beatsPerMinute" | "division">,
        { gridColor = "rgb(0, 53, 0)", gridRulerColor = "white", textColor = "white", paintGridLabels = true, labelFont = 'Consolas, "Courier New", "SF Mono", Monaco, Menlo, Courier, monospace' }: Partial<Pick<WaveformPaintOptions, "gridColor" | "gridRulerColor" | "textColor" | "paintGridLabels" | "labelFont">> = {}
    ) {
        const { sampleRate } = this;
        const { ruler } = getRuler(viewRange, audioUnit, { sampleRate, beatsPerMeasure, beatsPerMinute, division });
        ctx.clearRect(0, 0, width, height);
        const top = paintGridLabels ? 40 : 0;
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
        if (!paintGridLabels) return;
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
    async paintHorizontalRuler(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0 }: Partial<DrawOptions>,
        _stateAndConfigurations: any,
        { gridColor = "rgb(0, 53, 0)", gridRulerColor = "white", textColor = "white", paintGridLabels = true, labelFont = 'Consolas, "Courier New", "SF Mono", Monaco, Menlo, Courier, monospace' }: Partial<Pick<WaveformPaintOptions, "gridColor" | "gridRulerColor" | "textColor" | "paintGridLabels" | "labelFont">> = {}
    ) {
        const { numberOfChannels } = this;
        const channelHeight = height / numberOfChannels;

        ctx.clearRect(0, 0, width, height);
        const right = paintGridLabels ? 80 : 0;
        const range = channelHeight > 100 ? [-3, -6, -12, -18] : [-3, -12];
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        let center: number;
        let a: number;
        const x = width - right;
        let y: number;
        for (let i = 0; i < numberOfChannels; i++) {
            center = (i + 0.5) * channelHeight;
            ctx.moveTo(0, center);
            ctx.lineTo(x, center);
            for (let j = 0; j < range.length; j++) {
                a = dbtoa(range[j]);
                y = center - a * channelHeight * 0.5;
                ctx.moveTo(0, y);
                ctx.lineTo(x, y);
                y = center + a * channelHeight * 0.5;
                ctx.moveTo(0, y);
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        if (!paintGridLabels) return;
        ctx.strokeStyle = gridRulerColor;
        ctx.fillStyle = textColor;
        ctx.font = `12px ${labelFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("dB", x + 14, 10);
        ctx.beginPath();
        let isCoarse: boolean;
        for (let i = 0; i < numberOfChannels; i++) {
            if (i !== 0) {
                ctx.moveTo(x, i * channelHeight);
                ctx.lineTo(width, i * channelHeight);
            }
            center = (i + 0.5) * channelHeight;
            ctx.moveTo(x, center);
            ctx.lineTo(x + 10, center);
            ctx.fillText("-∞", x + 14, center);
            for (let db = height > 250 ? -1 : -3; db >= -18; db -= (height > 250 ? 1 : 3)) {
                a = dbtoa(db);
                y = center - a * channelHeight * 0.5;
                isCoarse = range.indexOf(db) !== -1;
                ctx.moveTo(x, y);
                ctx.lineTo(x + (isCoarse ? 10 : 5), y);
                if (isCoarse) ctx.fillText(db.toString(), x + 14, y);
                y = center + a * channelHeight * 0.5;
                ctx.moveTo(x, y);
                ctx.lineTo(x + (isCoarse ? 10 : 5), y);
                if (isCoarse) ctx.fillText(db.toString(), x + 14, y);
            }
        }
        ctx.stroke();
    }
    async paint(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0 }: Partial<DrawOptions>,
        { viewRange }: Pick<AudioEditorState, "viewRange">,
        { phosphorColor = "rgb(67, 217, 150)", separatorColor = "grey", cursorColor = "rgba(191, 0, 0)", fadePathColor = "yellow", fadeInExp = 1, fadeInTo, fadeOutExp = 1, fadeOutFrom, fade = 0 }: Partial<Pick<WaveformPaintOptions, "phosphorColor" | "separatorColor" | "cursorColor" | "fadePathColor" | "fadeInTo" | "fadeInExp" | "fadeOutFrom" | "fadeOutExp" | "fade">> = {}
    ) {
        ctx.clearRect(0, 0, width, height);
        
        const { audioData, _dataSlices, numberOfChannels } = this;
        const yMin = -verticalZoom;
        const yMax = verticalZoom;
        // Grids
        const channelHeight = height / numberOfChannels;
        const calcY = (v: number, channel: number) => channelHeight * (channel + 1 - (v - yMin) / (yMax - yMin));
        // Fades Path
        const fadeInPath: [number, number][] = [];
        const fadeOutPath: [number, number][] = [];
        const fadePath: [number, number][] = [];

        ctx.beginPath();
        ctx.setLineDash([4, 2]);
        ctx.strokeStyle = separatorColor;
        for (let channel = 1; channel < numberOfChannels; channel++) {
            ctx.moveTo(0, channel * channelHeight);
            ctx.lineTo(width, channel * channelHeight);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        // Horizontal Range
        const [$drawFrom, $drawTo] = viewRange; // Draw start-end
        const pixelsPerSample = width / ($drawTo - $drawFrom);
        const bestResizesIndex = this.getBestResizes(1 / pixelsPerSample);
        // Iteration
        let minInStep: number;
        let maxInStep: number;
        let $ = $drawFrom;
        let $$: number;
        let $0: number;
        let offsetStart: number;
        let $1: number;
        let offsetEnd: number;
        let $next: number;
        let subarray: number[];
        let x: number;
        let y: number;
        let prev: number;
        let prevX: number;
        let prevY: number;
        let next: number;
        let nextX: number;
        let nextY: number;
        let fadeFactor: number;
        let clip: Path2D;
        for (let channel = 0; channel < numberOfChannels; channel++) {
            $$ = $;
            x = -0.5 * pixelsPerSample;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            clip = new Path2D();
            clip.rect(0, channel * channelHeight, width, channelHeight);
            ctx.clip(clip);
            ctx.beginPath();
            ctx.strokeStyle = phosphorColor;
            ctx.fillStyle = phosphorColor;
            for (let i = 0; i < _dataSlices.length; i++) {
                const { startIndex, endIndex, resizedWaveforms } = _dataSlices[i];
                if ($$ >= $drawTo) break;
                if (endIndex <= $$) {
                    $$ = endIndex;
                    continue;
                }
                if (bestResizesIndex[i] !== -1) {
                    const { maxData, minData, samplesPerPixel, offsetFromFrame } = resizedWaveforms.resizes[bestResizesIndex[i]];
                    $0 = ~~(($$ - startIndex) / samplesPerPixel);
                    offsetStart = $$ - (startIndex - offsetFromFrame + $0 * samplesPerPixel);
                    $1 = Math.ceil((Math.min($drawTo, endIndex) - startIndex) / samplesPerPixel);
                    offsetEnd = Math.min($drawTo, endIndex) - (startIndex - offsetFromFrame + $1 * samplesPerPixel);
                    for (let j = $0; j < $1; j++) {
                        x = ($$ - $drawFrom) * pixelsPerSample;
                        minInStep = minData[channel][j];
                        maxInStep = maxData[channel][j];
                        /*
                        fadeFactor = 1;
                        if (typeof fadeInTo === "number" && $$ < fadeInTo) {
                            fadeFactor = normExp(($$ - $drawFrom) / fadeInTo, fadeInExp);
                            if (channel === 0) fadeInPath.push([x, fadeFactor]);
                        } else if (typeof fadeOutFrom === "number" && $$ >= fadeOutFrom) {
                            fadeFactor = normExp(($drawTo - $$) / ($drawTo - fadeOutFrom), fadeOutExp);
                            if (channel === 0) fadeOutPath.push([x, fadeFactor]);
                        } else if (typeof fade === "number" && selRange && $$ >= selRange[0] && $$ < selRange[1]) {
                            fadeFactor = dbtoa(fade);
                            if (channel === 0) fadePath.push([x, fadeFactor]);
                        }
                        if (fadeFactor !== 1) {
                            minInStep *= fadeFactor;
                            maxInStep *= fadeFactor;
                        }
                        */
                        y = calcY(maxInStep, channel);
                        if (x === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                        if (minInStep !== maxInStep) {
                            y = calcY(minInStep, channel);
                            ctx.lineTo(x, y);
                        }
                        $$ += samplesPerPixel;
                        if (j === $0) $$ -= offsetStart;
                        if (j === $1) $$ -= offsetEnd;
                    }
                } else {
                    prev = audioData[channel][$$ - 1] || 0;
                    prevX = ($$ - 0.5 - $drawFrom) * pixelsPerSample;
                    prevY = calcY(prev, channel);
                    ctx.moveTo(x, prevY);
                    while ($$ < endIndex && $$ < $drawTo) {
                        x = ($$ + 0.5 - $drawFrom) * pixelsPerSample;
                        $next = Math.min($$ + Math.max(1, Math.round(1 / pixelsPerSample)), $drawTo, endIndex);
                        subarray = audioData[channel].subarray($$, $next) as any;
                        minInStep = Math.min.apply(Math, subarray);
                        maxInStep = Math.max.apply(Math, subarray);
                        /*
                        fadeFactor = 1;
                        if (typeof fadeInTo === "number" && $$ < fadeInTo) {
                            fadeFactor = normExp(($$ - $drawFrom) / fadeInTo, fadeInExp);
                            if (channel === 0) fadeInPath.push([x, fadeFactor]);
                        } else if (typeof fadeOutFrom === "number" && $$ >= fadeOutFrom) {
                            fadeFactor = normExp(($drawTo - $$) / ($drawTo - fadeOutFrom), fadeOutExp);
                            if (channel === 0) fadeOutPath.push([x, fadeFactor]);
                        } else if (typeof fade === "number" && selRange && $$ >= selRange[0] && $$ < selRange[1]) {
                            fadeFactor = dbtoa(fade);
                            if (channel === 0) fadePath.push([x, fadeFactor]);
                        }
                        if (fadeFactor !== 1) {
                            minInStep *= fadeFactor;
                            maxInStep *= fadeFactor;
                        }
                        */
                        y = calcY(maxInStep, channel);
                        ctx.lineTo(x, y);
                        if (minInStep !== maxInStep && pixelsPerSample <= 1) {
                            y = calcY(minInStep, channel);
                            ctx.lineTo(x, y);
                        }
                        if (pixelsPerSample > 10) ctx.fillRect(x - 2, y - 2, 4, 4);
                        $$ = $next;
                    }
                    next = audioData[channel][$$] || 0;
                    nextX = ($$ + 0.5 - $drawFrom) * pixelsPerSample;
                    nextY = calcY(next, channel);
                    ctx.lineTo(nextX, nextY);
                }
            }
            ctx.stroke();
            ctx.restore();
        }
        /*
        // fade paths
        ctx.strokeStyle = fadePathColor;
        ctx.lineWidth = 1;
        if (fadeInPath.length) {
            ctx.beginPath();
            ctx.moveTo(0, height);
            fadeInPath.forEach(([x, y]) => ctx.lineTo(x, ~~(height * (1 - y))));
            ctx.lineTo(fadeInPath[fadeInPath.length - 1][0], 0);
            ctx.stroke();
        }
        if (fadeOutPath.length) {
            ctx.beginPath();
            ctx.moveTo(fadeOutPath[0][0], 0);
            fadeOutPath.forEach(([x, y]) => ctx.lineTo(x, ~~(height * (1 - y))));
            ctx.lineTo(width, height);
            ctx.stroke();
        }
        if (fadePath.length) {
            ctx.beginPath();
            ctx.moveTo(fadePath[0][0], fadePath[0][1]);
            fadePath.forEach(([x, y], i) => ctx.lineTo(x, ~~(height * (1 - y))));
            ctx.stroke();
        }
        // cursor
        if (cursor < $drawFrom || cursor > $drawTo) return;
        ctx.strokeStyle = cursorColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        x = (cursor - $drawFrom) * pixelsPerSample;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        */
    }
}

export default Waveform;
