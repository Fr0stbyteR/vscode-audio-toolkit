import { VisualizationOptions, VisualizationStyleOptions } from "./AudioToolkitModule";
import { atodb, dbtoa, generateRuler, getRuler, isCloseToMultipleOf, mod } from "../utils";

export interface VectorResizeOptions {
    resizeFactor: number;
    minWidth: number;
}

export interface ResizedVector {
    offsetFromFrame: number;
    audioSamplesPerFrame: number;
    minData: Float32Array[];
    maxData: Float32Array[];
}

export interface ResizedVectors {
    resizes: ResizedVector[];
    sizes: number[];
    resizeOptions: VectorResizeOptions;
}

export interface VectorPaintOptions {
    width: number;
    height: number;
    verticalZoom: number;
    verticalOffset: number;
    beforeAndAfter: "none" | "inherit" | number;
    paintOver: boolean;
    paintSeparator: boolean;
    labelsHeight: number;
    labelsWidth: number;
    labelMode: "linear" | "decibel";
    labelUnit: string;
    confidenceDataSlices: VectorDataSlice[];
    confidenceThreshold: number | undefined;
}

export interface VectorDataSlice {
    startIndex: number;
    endIndex: number;
    offsetFromSample: number;
    audioSamplesPerSample: number;
    vectors: Float32Array[];
    resizedVectors: ResizedVectors;
}
export interface VectorCursorInfo {
    x: number;
    y: number;
    channel: number;
    value: number | [number, number];
    fromIndex: number;
    /** Exclusive */
    toIndex: number;
};

class VectorImageProcessor {
    static DEFAULT_RESIZE_FACTOR = 4;
    static DEFAULT_MIN_WIDTH = 4;
    static generateResized(vectors: Float32Array[], audioSamplesPerFrame: number, { resizeFactor = this.DEFAULT_RESIZE_FACTOR, minWidth = this.DEFAULT_MIN_WIDTH }: Partial<VectorResizeOptions> = {}) {
        const SharedArrayBuffer = globalThis.SharedArrayBuffer || globalThis.ArrayBuffer;
        const numberOfChannels = vectors.length;
        const ow = vectors?.[0].length;
        const resizes: ResizedVector[] = [];
        const sizes: number[] = [];
        const resized: ResizedVectors = { resizes, sizes, resizeOptions: { resizeFactor, minWidth } };
        const offsetFromFrame = 0;
        let pw: number;
        let w: number;
        let prevMinData: Float32Array[];
        let prevMaxData: Float32Array[];
        let minData: Float32Array[];
        let maxData: Float32Array[];
        let $start: number;
        let $end: number;
        let subarray: number[];
        let initialCalculation = true;
        for (w = Math.ceil(ow / resizeFactor); w >= minWidth; w = Math.ceil(w / resizeFactor)) {
            audioSamplesPerFrame *= resizeFactor;
            minData = [];
            maxData = [];
            for (let channel = 0; channel < numberOfChannels; channel++) {
                minData[channel] = new Float32Array(new SharedArrayBuffer(w * Float32Array.BYTES_PER_ELEMENT));
                maxData[channel] = new Float32Array(new SharedArrayBuffer(w * Float32Array.BYTES_PER_ELEMENT));
                for (let i = 0; i < w; i++) {
                    if (initialCalculation) {
                        $start = i * resizeFactor;
                        $end = Math.min((i + 1) * resizeFactor, ow);
                        subarray = vectors[channel].subarray($start, $end) as any;
                        minData[channel][i] = Math.min.apply(Math, subarray);
                        maxData[channel][i] = Math.max.apply(Math, subarray);
                    } else {
                        $start = i * resizeFactor;
                        $end = Math.min((i + 1) * resizeFactor, pw!);
                        minData[channel][i] = Math.min.apply(Math, prevMinData![channel].subarray($start, $end) as any);
                        maxData[channel][i] = Math.max.apply(Math, prevMaxData![channel].subarray($start, $end) as any);
                    }
                }
            }
            sizes.push(w);
            resizes.push({ offsetFromFrame, audioSamplesPerFrame, minData, maxData });
            pw = w;
            prevMinData = minData;
            prevMaxData = maxData;
            initialCalculation = false;
        }
        return resized;
    }
    static getBestResizes(dataSlices: VectorDataSlice[], targetAudioSamplesPerPixel: number) {
        return dataSlices.map(({ resizedVectors }) => {
            return resizedVectors.resizes.findLastIndex(({ audioSamplesPerFrame }) => audioSamplesPerFrame < targetAudioSamplesPerPixel);
        });
    }
    static paint(
        ctx: CanvasRenderingContext2D,
        dataSlices: VectorDataSlice[],
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0, beforeAndAfter = "inherit", paintOver = false, paintSeparator = !paintOver, confidenceDataSlices, confidenceThreshold }: Partial<VectorPaintOptions>,
        { viewRange }: Pick<VisualizationOptions<any>, "viewRange">,
        { phosphorColor = "rgb(67, 217, 150)", separatorColor = "grey" }: Partial<Pick<VisualizationStyleOptions, "phosphorColor" | "separatorColor">> 
    ) {
        const numberOfChannels = dataSlices[0].vectors.length;
        const yMin = (verticalOffset - 1) / verticalZoom;
        const yMax = (verticalOffset + 1) / verticalZoom;
        // Grids
        const channelHeight = height / numberOfChannels;
        // Horizontal Range
        const [$drawFrom, $drawTo] = viewRange; // Draw start-end
        const pixelsPerAudioSample = width / ($drawTo - $drawFrom);
        const calcY = (v: number, channel: number) => channelHeight * (channel + 1 - (v - yMin) / (yMax - yMin));
        const calcX = ($: number) => ($ - $drawFrom) * pixelsPerAudioSample;
        const get$ = ($dataSlice: number, $resize: number, $vector: number) => {
            const { startIndex, audioSamplesPerSample, resizedVectors, offsetFromSample } = dataSlices[$dataSlice];
            if ($resize === -1) return startIndex - offsetFromSample + $vector * audioSamplesPerSample;
            const resize = resizedVectors.resizes[$resize];
            return startIndex - resize.offsetFromFrame + $vector * resize.audioSamplesPerFrame;
        };

        ctx.save();
        if (!paintOver) ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        ctx.lineWidth = 1;
        if (paintSeparator) {
            ctx.beginPath();
            ctx.setLineDash([4, 2]);
            ctx.strokeStyle = separatorColor;
            for (let channel = 1; channel < numberOfChannels; channel++) {
                ctx.moveTo(0, channel * channelHeight);
                ctx.lineTo(width, channel * channelHeight);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        const bestResizesIndex = this.getBestResizes(dataSlices, 1 / pixelsPerAudioSample);

        let $ = 0;
        let $$ = 0;
        let $vector: number;
        let $$vector: number;
        let $resize: number;
        let samples: number;
        let pixelsPerSample: number; 
        let v = 0;       
        let x = 0;
        let y = 0;
        let clip: Path2D;
        let minInStep = 0;
        let maxInStep = 0;
        let prevVector: Float32Array;
        let nextVector: Float32Array;
        let isFirstSample: boolean;
        let pathStarted = false;
    
        for (let $dataSlice = 0; $dataSlice < dataSlices.length; $dataSlice++) {
            const { startIndex, endIndex, resizedVectors, audioSamplesPerSample, vectors, offsetFromSample } = dataSlices[$dataSlice];
            const confidenceVectors = confidenceDataSlices?.[$dataSlice].vectors;
            pixelsPerSample = pixelsPerAudioSample * audioSamplesPerSample;
            samples = endIndex - startIndex;
            if ($ + samples <= $drawFrom) {
                $ += length;
                continue;
            }
            if ($ >= $drawTo) break;
            $resize = bestResizesIndex[$dataSlice];
            if ($resize === -1) {
                if ($ < $drawFrom) $vector = ~~Math.max(0, ($drawFrom - (startIndex - offsetFromSample)) / audioSamplesPerSample);
                else $vector = 0;
                $ = get$($dataSlice, $resize, $vector);
                for (let channel = 0; channel < numberOfChannels; channel++) {
                    $$ = $;
                    $$vector = $vector;
                    ctx.save();
                    clip = new Path2D();
                    clip.rect(0, channel * channelHeight, width, channelHeight);
                    ctx.clip(clip);
                    ctx.beginPath();
                    ctx.strokeStyle = phosphorColor;
                    ctx.fillStyle = phosphorColor;
                    pathStarted = true;
                    if ($$vector > 0) {
                        v = vectors[channel][$$vector - 1];
                        x = calcX($$) - 0.5 * pixelsPerSample;
                    } else if ($dataSlice > 0) {
                        prevVector = dataSlices[$dataSlice - 1].vectors[channel];
                        v = prevVector[prevVector.length - 1];
                        x = calcX(get$($dataSlice - 1, $resize, prevVector.length - 1)) - 0.5 * pixelsPerAudioSample * dataSlices[$dataSlice - 1].audioSamplesPerSample;
                    } else if (beforeAndAfter !== "none") {
                        v = beforeAndAfter === "inherit" ? vectors[channel][$$vector] : beforeAndAfter;
                        x = beforeAndAfter === "inherit" ? 0 : calcX($$) - 0.5 * pixelsPerSample;
                    } else {
                        pathStarted = false;
                    }
                    if (pathStarted) {
                        y = calcY(v, channel);
                        ctx.moveTo(x, y);
                    }
                    while ($$ < endIndex && $$ < $drawTo && $$vector < vectors[channel].length) {
                        v = vectors[channel][$$vector];
                        if ((typeof confidenceThreshold === "undefined") || v >= confidenceThreshold || (confidenceVectors && confidenceVectors[channel][$$vector] >= confidenceThreshold)) {
                            x = calcX($$) + 0.5 * pixelsPerSample;
                            y = calcY(v, channel);
                            if (pathStarted) {
                                ctx.lineTo(x, y);
                            } else {
                                ctx.moveTo(x, y);
                                pathStarted = true;
                            }
                            if (pixelsPerSample > 10) ctx.fillRect(x - 2, y - 2, 4, 4);
                        } else {
                            pathStarted = false;
                        }
                        $$vector++;
                        $$ = get$($dataSlice, $resize, $$vector);
                    }
                    if ($$vector < vectors[channel].length - 1) {
                        v = vectors[channel][$$vector + 1];
                        x = calcX($$) + 0.5 * pixelsPerSample;
                    } else if ($dataSlice < dataSlices.length - 1) {
                        nextVector = dataSlices[$dataSlice + 1].vectors[channel];
                        v = nextVector[0];
                        x = calcX(get$($dataSlice + 1, $resize, 0)) + 0.5 * pixelsPerAudioSample * dataSlices[$dataSlice + 1].audioSamplesPerSample;
                    } else if (beforeAndAfter !== "none") {
                        if (beforeAndAfter !== "inherit") v = beforeAndAfter;
                        x = beforeAndAfter === "inherit" ? width : calcX($$) + 0.5 * pixelsPerSample;
                    } else {
                        pathStarted = false;
                    }
                    if (pathStarted) {
                        y = calcY(v, channel);
                        ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            } else {
                const { maxData, minData, audioSamplesPerFrame, offsetFromFrame } = resizedVectors.resizes[bestResizesIndex[$dataSlice]];
                const confidenceMinData = confidenceDataSlices?.[$dataSlice].resizedVectors.resizes[bestResizesIndex[$dataSlice]].minData;
                if ($ < $drawFrom) $vector = ~~Math.max(0, ($drawFrom - (startIndex - offsetFromFrame)) / audioSamplesPerFrame);
                else $vector = 0;
                $ = get$($dataSlice, $resize, $vector);
                for (let channel = 0; channel < numberOfChannels; channel++) {
                    $$ = $;
                    $$vector = $vector;
                    ctx.save();
                    clip = new Path2D();
                    clip.rect(0, channel * channelHeight, width, channelHeight);
                    ctx.clip(clip);
                    ctx.beginPath();
                    ctx.strokeStyle = phosphorColor;
                    ctx.fillStyle = phosphorColor;
                    isFirstSample = false;
                    if ($$vector > 0) {
                        v = maxData[channel][$$vector];
                        x = calcX($$) - 0.5 * pixelsPerSample;
                    } else if ($dataSlice > 0) {
                        prevVector = dataSlices[$dataSlice - 1].vectors[channel];
                        v = prevVector[prevVector.length - 1];
                        x = calcX(get$($dataSlice - 1, $resize, prevVector.length - 1)) - 0.5 * pixelsPerAudioSample * dataSlices[$dataSlice - 1].audioSamplesPerSample;
                    } else if (beforeAndAfter !== "none") {
                        v = beforeAndAfter === "inherit" ? maxData[channel][$$vector] : beforeAndAfter;
                        x = beforeAndAfter === "inherit" ? 0 : calcX($$) - 0.5 * pixelsPerSample;
                    } else {
                        pathStarted = false;
                    }
                    if (pathStarted) {
                        y = calcY(v, channel);
                        ctx.moveTo(x, y);
                    }
                    while ($$ < endIndex && $$ < $drawTo && $$vector < minData[channel].length) {
                        minInStep = minData[channel][$$vector];
                        maxInStep = maxData[channel][$$vector];
                        if ((typeof confidenceThreshold === "undefined") || minInStep >= confidenceThreshold || (confidenceMinData && confidenceMinData[channel][$$vector] >= confidenceThreshold)) {
                            x = calcX($$);
                            y = calcY(maxInStep, channel);
                            if (pathStarted) {
                                ctx.lineTo(x, y);
                            } else {
                                ctx.moveTo(x, y);
                                pathStarted = true;
                            }
                            if (minInStep !== maxInStep) {
                                y = calcY(minInStep, channel);
                                ctx.lineTo(x, y);
                            }
                        } else {
                            pathStarted = false;
                        }
                        $$vector++;
                        $$ = get$($dataSlice, $resize, $$vector);
                    }
                    if ($$vector < minData[channel].length - 1) {
                        v = minData[channel][$$vector + 1];
                        x = calcX($$) + 0.5 * pixelsPerSample;
                    } else if ($dataSlice < dataSlices.length - 1) {
                        nextVector = dataSlices[$dataSlice + 1].vectors[channel];
                        v = nextVector[0];
                        x = calcX(get$($dataSlice + 1, $resize, 0)) + 0.5 * pixelsPerAudioSample * dataSlices[$dataSlice + 1].audioSamplesPerSample;
                    } else if (beforeAndAfter !== "none") {
                        v = beforeAndAfter === "inherit" ? minInStep : beforeAndAfter;
                        x = beforeAndAfter === "inherit" ? width : calcX($$) + 0.5 * pixelsPerSample;
                    } else {
                        pathStarted = false;
                    }
                    if (pathStarted) {
                        y = calcY(v, channel);
                        ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            }
            $ = $$;
        }
        ctx.restore();
    }
    static paintHorizontalRuler(
        ctx: CanvasRenderingContext2D,
        numberOfChannels: number,
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0, labelsWidth = 0, labelMode = "decibel", labelUnit = labelMode === "decibel" ? "dB" : "" }: Partial<VectorPaintOptions>,
        { gridColor = "rgb(0, 53, 0)", gridRulerColor = "white", textColor = "white", labelFont = 'Consolas, "Courier New", "SF Mono", Monaco, Menlo, Courier, monospace' }: Partial<Pick<VisualizationStyleOptions, "gridColor" | "gridRulerColor" | "textColor" | "labelFont">> = {}
    ) {
        const channelHeight = height / numberOfChannels;

        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = gridColor;
        ctx.beginPath();

        const x = width - labelsWidth;
        let y: number;
        const yMin = (verticalOffset - 1) / verticalZoom;
        const yMax = (verticalOffset + 1) / verticalZoom;
        let coarse = 0.1;
        let refined = 0.01;
        let db: number;
        let dbMin = -90;
        let dbMax = 0;
        let a: number;
        const calcY = (v: number, channel: number) => channelHeight * (channel + 1 - (v - yMin) / (yMax - yMin));
        if (labelMode === "decibel") {
            if (yMin <= 0 && yMax >= 0) {
                while (dbtoa(dbMin) / (yMax - yMin) * channelHeight < 3) {
                    dbMin++;
                }
            } else {
                dbMin = Math.max(-90, ~~atodb(Math.min(Math.abs(yMin), Math.abs(yMax))));
            }
            dbMax = ~~atodb(Math.max(Math.abs(yMin), Math.abs(yMax)));
            for (let channel = 0; channel < numberOfChannels; channel++) {
                let lastCoarseY = Infinity;
                let lastRefinedY = Infinity;
                if (yMin < 0 && 0 < yMax) {
                    y = calcY(0, channel);
                    ctx.moveTo(0, y);
                    ctx.lineTo(x, y);
                }
                db = dbMax;
                coarse = 1;
                refined = 1;
                while (db > dbMin) {
                    a = dbtoa(db);
                    if (Math.abs(calcY(a, channel) - lastRefinedY) < 3) {
                        refined++;
                        coarse++;
                        db--;
                        continue;
                    }
                    if (Math.abs(calcY(a, channel) - lastCoarseY) < 25) {
                        coarse += refined;
                        db -= refined;
                        lastRefinedY = calcY(a, channel);
                        continue;
                    }
                    lastCoarseY = calcY(a, channel);
                    if (db === dbMax) {
                        db -= refined;
                        continue;
                    }
                    if (yMin < a && a < yMax) {
                        y = lastCoarseY;
                        ctx.moveTo(0, y);
                        ctx.lineTo(x, y);
                    }
                    if (yMin < -a && -a < yMax) {
                        y = calcY(-a, channel);
                        ctx.moveTo(0, y);
                        ctx.lineTo(x, y);
                    }
                    db -= refined;
                }
            }
        } else {
            [coarse, refined] = generateRuler([1, 2, 5], 10, 10 ** Math.round(Math.log10(1 / verticalZoom) - 2), a => a / (yMax - yMin) * channelHeight);
            const aMin = Math.ceil(yMin / coarse) * coarse;
            const aMax = Math.floor(yMax / coarse) * coarse;
            for (let channel = 0; channel < numberOfChannels; channel++) {
                a = aMin;
                while (a <= aMax) {
                    y = calcY(a, channel);
                    ctx.moveTo(0, y);
                    ctx.lineTo(x, y);
                    a += coarse;
                }
            }
        }
        ctx.stroke();
        ctx.restore();

        if (!labelsWidth) return;
        ctx.save();
        ctx.strokeStyle = gridRulerColor;
        ctx.fillStyle = textColor;
        ctx.font = `12px ${labelFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        if (labelUnit) ctx.fillText(labelUnit, x + 14, 10);
        ctx.beginPath();
        let x1: number;
        for (let i = 0; i < numberOfChannels; i++) {
            if (i !== 0) {
                ctx.moveTo(x, i * channelHeight);
                ctx.lineTo(width, i * channelHeight);
            }
        }
        let isCoarse = false;
        if (labelMode === "decibel") {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                let lastCoarseY = Infinity;
                let lastRefinedY = Infinity;
                if (yMin < 0 && 0 < yMax) {
                    y = calcY(0, channel);
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + 10, y);
                    ctx.fillText("-∞", x + 14, y);
                    lastCoarseY = y;
                }
                db = dbMax;
                coarse = 1;
                refined = 1;
                const draw = () => {
                    if (yMin < a && a < yMax) {
                        y = calcY(a, channel);
                        ctx.moveTo(x, y);
                        ctx.lineTo(x1, y);
                        if (isCoarse && y > channelHeight * channel + 20 && y < channelHeight * (channel + 1) - 10) ctx.fillText(db.toString(), x + 14, y);
                    }
                    if (yMin < -a && -a < yMax) {
                        y = calcY(-a, channel);
                        ctx.moveTo(x, y);
                        ctx.lineTo(x1, y);
                        if (isCoarse && y > channelHeight * channel + 20 && y < channelHeight * (channel + 1) - 10) ctx.fillText(db.toString(), x + 14, y);
                    }
                };
                while (db >= dbMin) {
                    a = dbtoa(db);
                    if (Math.abs(calcY(a, channel) - lastRefinedY) < 3) {
                        refined++;
                        coarse++;
                        db--;
                        continue;
                    }
                    if (Math.abs(calcY(a, channel) - lastCoarseY) < 25) {
                        coarse += refined;
                        db -= refined;
                        lastRefinedY = calcY(a, channel);
                        isCoarse = false;
                        x1 = x + 5;
                        draw();
                        continue;
                    }
                    lastCoarseY = calcY(a, channel);
                    isCoarse = true;
                    x1 = x + 10;
                    draw();
                    db -= refined;
                }
            }
        } else {
            const aMin = Math.ceil(yMin / refined) * refined;
            const aMax = Math.floor(yMax / refined) * refined;
            for (let channel = 0; channel < numberOfChannels; channel++) {
                a = aMin;
                while (a <= aMax) {
                    isCoarse = isCloseToMultipleOf(a, coarse);
                    x1 = x + (isCoarse ? 10 : 5);
                    y = calcY(a, channel);
                    ctx.moveTo(x, y);
                    ctx.lineTo(x1, y);
                    if (isCoarse && y > channelHeight * channel + 20 && y < channelHeight * (channel + 1) - 10) ctx.fillText((Math.abs(a) < 1e-10 ? 0 : +(a.toPrecision(7))).toString(), x + 14, y);
                    a += refined;
                }
            }
        }
        ctx.stroke();
        ctx.restore();
    }
    static paintVerticalRuler(
        ctx: CanvasRenderingContext2D,
        sampleRate: number,
        { width = ctx.canvas.width, height = ctx.canvas.height, labelsHeight = 0 }: Partial<VectorPaintOptions>,
        { viewRange, configuration: { audioUnit, beatsPerMeasure, beatsPerMinute, division } }: Pick<VisualizationOptions<any>, "viewRange" | "configuration">,
        { gridColor = "rgb(0, 53, 0)", gridRulerColor = "white", textColor = "white", labelFont = 'Consolas, "Courier New", "SF Mono", Monaco, Menlo, Courier, monospace' }: Partial<Pick<VisualizationStyleOptions, "gridColor" | "gridRulerColor" | "textColor" | "labelFont">> = {}
    ) {
        const { ruler } = getRuler(viewRange, audioUnit, { sampleRate, beatsPerMeasure, beatsPerMinute, division });
        ctx.save();
        ctx.clearRect(0, 0, width, height);
        const top = labelsHeight;
        const [$drawFrom, $drawTo] = viewRange;
        const pixelsPerSample = width / ($drawTo - $drawFrom);
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        let x: number;
        let y: number;
        let text: string;
        for (const $str in ruler) {
            text = ruler[$str];
            if (!text) continue;
            x = (+$str - $drawFrom) * pixelsPerSample;
            ctx.moveTo(x, top);
            ctx.lineTo(x, height);
        }
        ctx.stroke();
        ctx.restore();
        if (!labelsHeight) return;
        ctx.save();
        ctx.strokeStyle = gridRulerColor;
        ctx.fillStyle = textColor;
        ctx.font = `12px ${labelFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(audioUnit === "time" ? "hms" : audioUnit === "measure" ? `${beatsPerMinute} bpm` : "samps", 2, top - 14);
        ctx.textAlign = "center";
        ctx.beginPath();
        for (const $str in ruler) {
            text = ruler[$str];
            x = (+$str - $drawFrom) * pixelsPerSample;
            y = text ? top - 10 : top - 5;
            ctx.moveTo(x, y);
            ctx.lineTo(x, top);
            if (text) ctx.fillText(text, x, y - 4);
        }
        ctx.stroke();
        ctx.restore();
    }
    static getInfoFromCursor(
        dataSlices: VectorDataSlice[],
        x: number, y: number,
        { width, height, verticalZoom = 1, verticalOffset = 0 }: Partial<VectorPaintOptions> & Pick<VectorPaintOptions, "width" | "height">,
        { viewRange }: Pick<VisualizationOptions<any>, "viewRange">
    ): VectorCursorInfo {
        const numberOfChannels = dataSlices[0].vectors.length;
        const yMin = (verticalOffset - 1) / verticalZoom;
        const yMax = (verticalOffset + 1) / verticalZoom;
        const channelHeight = height / numberOfChannels;
        const [$drawFrom, $drawTo] = viewRange;
        const pixelsPerAudioSample = width / ($drawTo - $drawFrom);
        const $ = Math.max($drawFrom, Math.min($drawTo - 1, $drawFrom + x / pixelsPerAudioSample));
        const channel = Math.max(0, Math.min(numberOfChannels - 1, ~~(y / channelHeight)));
        const calcX = ($: number) => ($ - $drawFrom) * pixelsPerAudioSample;
        const calcY = (v: number, channel: number) => channelHeight * (channel + 1 - (v - yMin) / (yMax - yMin));
        const get$ = ($dataSlice: number, $resize: number, $vector: number) => {
            const { startIndex, audioSamplesPerSample, resizedVectors, offsetFromSample } = dataSlices[$dataSlice];
            if ($resize === -1) return startIndex - offsetFromSample + $vector * audioSamplesPerSample;
            const resize = resizedVectors.resizes[$resize];
            return startIndex - resize.offsetFromFrame + $vector * resize.audioSamplesPerFrame;
        };
        const bestResizesIndex = this.getBestResizes(dataSlices, 1 / pixelsPerAudioSample);
        const $dataSlice = dataSlices.findIndex(({ startIndex, endIndex }) => startIndex <= $ && $ < endIndex);
        const $resize = bestResizesIndex[$dataSlice];
        const { startIndex, endIndex, resizedVectors, audioSamplesPerSample, vectors, offsetFromSample } = dataSlices[$dataSlice];
        if ($resize === -1) {
            const $vector = Math.max(0, Math.min(vectors[channel].length - 1, ~~(($ - (startIndex - offsetFromSample)) / audioSamplesPerSample)));
            const fromIndex = get$($dataSlice, $resize, $vector);
            const toIndex = Math.min(endIndex, $drawTo, fromIndex + audioSamplesPerSample);
            const value = vectors[channel][$vector];
            const xx = calcX(fromIndex) + 0.5 * pixelsPerAudioSample * audioSamplesPerSample;
            const yy = calcY(value, channel);
            return { x: xx, y: yy, channel, value, fromIndex, toIndex };
        } else {
            const { maxData, minData, audioSamplesPerFrame, offsetFromFrame } = resizedVectors.resizes[bestResizesIndex[$dataSlice]];
            const $vector = Math.max(0, Math.min(maxData[channel].length - 1, ~~(($ - (startIndex - offsetFromFrame)) / audioSamplesPerFrame)));
            const fromIndex = get$($dataSlice, $resize, $vector);
            const toIndex = Math.min(endIndex, $drawTo, fromIndex + audioSamplesPerFrame);
            const minValue = minData[channel][$vector];
            const maxValue = maxData[channel][$vector];
            const x = calcX(fromIndex);
            const yMax = calcY(maxValue, channel);
            const yMin = calcY(minValue, channel);
            const d2yMax = Math.abs(yMax - y);
            const d2yMin = Math.abs(yMin - y);
            const yy = d2yMax <= d2yMin ? yMax : yMin;
            return { x, y: yy, channel, value: [minValue, maxValue], fromIndex, toIndex };
        }
    }
}

export default VectorImageProcessor;
