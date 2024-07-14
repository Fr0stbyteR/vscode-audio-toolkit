import { dbtoa, normExp } from "../utils";
import WaveformWorker from "../workers/WaveformWorker";
import { AudioEditorState, DrawOptions } from "./AudioEditor";
import OperableAudioBuffer from "./OperableAudioBuffer";

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
    fadePathColor: string;
    fadeInExp: number;
    fadeInTo: number;
    fadeOutExp: number;
    fadeOutFrom: number;
    fade: number;
}

const SharedArrayBuffer = globalThis.ArrayBuffer || globalThis.SharedArrayBuffer;

class Waveform {
    static DEFAULT_RESIZE_FACTOR = 4;
    static DEFAULT_MIN_WIDTH = 4;
    
    static async fromAudioData(audioData: Float32Array[]) {
        const waveform = new Waveform(audioData);
        const resized = waveform.generateResized();
        waveform._dataSlices = [resized];
        return waveform;
    }

    private _dataSlices: WaveformSliceData[] = [];
    get length() {
        return this.audioData[0].length;
    }
    get numberOfChannels() {
        return this.audioData.length;
    }
    constructor(
        public audioData: Float32Array[]
    ) {}

    generateResized({ resizeFactor = Waveform.DEFAULT_RESIZE_FACTOR, minWidth = Waveform.DEFAULT_MIN_WIDTH }: Partial<WaveformResizeOptions> = {}) {
        const { length } = this;
        const resizeOptions: WaveformResizeOptions = { resizeFactor, minWidth };
        const resizes: ResizedWaveform[] = [];
        const sizes: number[] = [];
        const data: WaveformSliceData = {
            startIndex: 0,
            endIndex: length,
            resizedWaveforms: {
                resizes,
                sizes,
                resizeOptions
            },
        };
        const offsetFromFrame = 0;
        let prevW: number;
        let w: number;
        let prevMinData: Float32Array[];
        let prevMaxData: Float32Array[];
        let minData: Float32Array[];
        let maxData: Float32Array[];
        let $start: number;
        let $end: number;
        let subarray: number[];
        for (let samplesPerPixel = resizeFactor; length / samplesPerPixel >= minWidth; samplesPerPixel *= resizeFactor) {
            w = Math.ceil(length / samplesPerPixel);
            minData = [];
            maxData = [];
            for (let channel = 0; channel < this.numberOfChannels; channel++) {
                minData[channel] = new Float32Array(new SharedArrayBuffer(w * Float32Array.BYTES_PER_ELEMENT));
                maxData[channel] = new Float32Array(new SharedArrayBuffer(w * Float32Array.BYTES_PER_ELEMENT));
                for (let i = 0; i < w; i++) {
                    if (samplesPerPixel === resizeFactor) {
                        $start = i * resizeFactor;
                        $end = Math.min((i + 1) * resizeFactor, length);
                        subarray = this.audioData[channel].subarray($start, $end) as any;
                        minData[channel][i] = Math.min.apply(Math, subarray);
                        maxData[channel][i] = Math.max.apply(Math, subarray);
                    } else {
                        $start = i * resizeFactor;
                        $end = Math.min((i + 1) * resizeFactor, prevW!);
                        minData[channel][i] = Math.min.apply(Math, prevMinData![channel].subarray($start, $end) as any);
                        maxData[channel][i] = Math.max.apply(Math, prevMaxData![channel].subarray($start, $end) as any);
                    }
                }
            }
            sizes.push(w);
            resizes.push({ offsetFromFrame, samplesPerPixel, minData, maxData });
            prevW = w;
            prevMinData = minData;
            prevMaxData = maxData;
        }
        return data;
    }

    getBestResizes(targetSamplesPerPixel: number) {
        return this._dataSlices.map((waveformSliceData) => {
            return waveformSliceData.resizedWaveforms.resizes.findLastIndex(({ samplesPerPixel }) => samplesPerPixel < targetSamplesPerPixel);
        });
    }
    async paint(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0 }: Partial<DrawOptions>,
        { cursor, selRange, viewRange }: Pick<AudioEditorState, "cursor" | "selRange" | "viewRange">,
        { phosphorColor = "rgb(67, 217, 150)", separatorColor = "grey", cursorColor = "rgba(191, 0, 0)", fadePathColor = "yellow", fadeInExp = 1, fadeInTo, fadeOutExp = 1, fadeOutFrom, fade = 0 }: Partial<WaveformPaintOptions> = {}
    ) {
        ctx.clearRect(0, 0, width, height);
        
        const { audioData, _dataSlices, numberOfChannels, length } = this;
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
                        y = calcY(maxInStep, channel);
                        if (x === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                        if (minInStep !== maxInStep) {
                            y = calcY(minInStep, i);
                            ctx.lineTo(x, y);
                        }
                        $$ += samplesPerPixel;
                        if (j === $0) $$ -= offsetStart;
                        if (j === $1) $$ -= offsetEnd;
                    }
                } else {
                    prev = audioData[channel][$$ - 1] || 0;
                    prevX = ($$ - 0.5 - $drawFrom) * pixelsPerSample;
                    prevY = calcY(prev, i);
                    ctx.moveTo(x, prevY);
                    while ($$ < endIndex && $$ < $drawTo) {
                        x = ($$ + 0.5 - $drawFrom) * pixelsPerSample;
                        $next = Math.min($$ + Math.max(1, Math.round(1 / pixelsPerSample)), $drawTo, endIndex);
                        subarray = audioData[channel].subarray($$, $next) as any;
                        minInStep = Math.min.apply(Math, subarray);
                        maxInStep = Math.max.apply(Math, subarray);
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
    }
}

export interface WaveformMinMaxData {
    min: Float32Array;
    max: Float32Array;
}
export interface WaveformStepData extends Array<WaveformMinMaxData> {
    idx?: Int32Array;
}
export interface WaveformData {
    [step: number]: WaveformStepData;
}

class Waveform1 {
    static stepsFactor = 16;
    static async fromAudioData(audioData: OperableAudioBuffer) {
        const waveform = new Waveform1(audioData);
        await waveform.generate();
        return waveform;
    }
    [step: number]: WaveformStepData;
    worker = new WaveformWorker();
    get length() {
        return this.audioBuffer.length;
    }
    get steps() {
        return Object.keys(this).filter(v => +v).map(v => +v).sort((a, b) => a - b);
    }
    constructor(
        public audioBuffer: OperableAudioBuffer
    ) {}

    async generate() {
        const audioChannelData = this.audioBuffer.toArray(true);
        const data = await this.worker.generate(audioChannelData, Waveform1.stepsFactor);
        for (const key in data) {
            this[key] = data[key];
        }
    }
    generateEmpty(numberOfChannels: number, l: number) {
        const { stepsFactor } = Waveform1;
        for (let stepLength = stepsFactor; stepLength <= l / stepsFactor; stepLength *= stepsFactor) {
            const stepData: WaveformStepData = [];
            this[stepLength] = stepData;
            const stepsCount = Math.ceil(l / stepLength);
            const idxData = new Int32Array(stepsCount);
            for (let i = 0; i < idxData.length; i++) {
                idxData[i] = i * stepLength;
            }
            stepData.idx = idxData;
            for (let c = 0; c < numberOfChannels; c++) {
                const minData = new Float32Array(stepsCount);
                const maxData = new Float32Array(stepsCount);
                stepData[c] = { min: minData, max: maxData };
            }
        }
    }
    generateStep(stepLength: number) {
        const { stepsFactor } = Waveform1;
        const { audioBuffer: buffer } = this;
        if (!this[stepLength]) this[stepLength] = [];
        const l = buffer.length;
        let maxInStep = 0;
        let minInStep = 0;
        if (stepLength === stepsFactor) { // recalculate from samples
            const stepsCount = Math.ceil(l / stepLength);
            const idxData = new Int32Array(stepsCount);
            for (let i = 0; i < idxData.length; i++) {
                idxData[i] = i * stepLength;
            }
            this[stepLength].idx = idxData;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
                const minData = new Float32Array(stepsCount);
                const maxData = new Float32Array(stepsCount);
                const channel = buffer.getChannelData(c);
                for (let i = 0; i < idxData.length; i++) {
                    const $0 = idxData[i];
                    const $1 = i === idxData.length - 1 ? l : idxData[i + 1];
                    for (let j = $0; j < $1; j++) {
                        const samp = channel[j];
                        if (j === $0) {
                            maxInStep = samp;
                            minInStep = samp;
                        } else {
                            if (samp > maxInStep) maxInStep = samp;
                            if (samp < minInStep) minInStep = samp;
                        }
                    }
                    minData[i] = minInStep;
                    maxData[i] = maxInStep;
                }
                this[stepLength][c] = { min: minData, max: maxData };
            }
        } else { // calculate from lower level
            const prevIdx = this[stepLength / stepsFactor].idx!;
            const stepsCount = Math.ceil(prevIdx.length / 16);
            const idxData = new Int32Array(stepsCount);
            for (let i = 0; i < idxData.length; i++) {
                idxData[i] = prevIdx[i * stepsFactor];
            }
            this[stepLength].idx = idxData;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
                const minData = new Float32Array(stepsCount);
                const maxData = new Float32Array(stepsCount);
                const { min: prevMin, max: prevMax } = this[stepLength / stepsFactor][c];
                for (let i = 0; i < idxData.length; i++) {
                    const $prev0 = i * stepsFactor;
                    const $prev1 = i === idxData.length - 1 ? prevIdx.length : ((i + 1) * stepsFactor);
                    for (let j = $prev0; j < $prev1; j++) {
                        const sampMax = prevMax[j];
                        const sampMin = prevMin[j];
                        if (j === $prev0) {
                            maxInStep = sampMax;
                            minInStep = sampMin;
                        } else {
                            if (sampMax > maxInStep) maxInStep = sampMax;
                            if (sampMin < minInStep) minInStep = sampMin;
                        }
                    }
                    minData[i] = minInStep;
                    maxData[i] = maxInStep;
                }
                this[stepLength][c] = { min: minData, max: maxData };
            }
        }
        return this[stepLength];
    }
    /**
     * Find an existing waveform with a precision (could be samples per pixel)
     * returning a waveform that is sufficient to the precision.
     * (step is the largest value smaller than the precision)
     */
    findStep(precision: number) {
        const key = this.steps.reduce<number>((acc, cur) => (cur < precision && cur > (acc || 0) ? cur : acc), 0);
        if (!key) return null;
        return this[key];
    }
}

export default Waveform;
