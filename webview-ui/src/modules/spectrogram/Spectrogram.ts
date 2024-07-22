import { AudioToolkitModule, FrequencyDomainChannelData, VisualizationOptions, VisualizationStyleOptions } from "../../core/AudioToolkitModule";
import SpectrogramComponent from "./SpectrogramComponent";
import SpectrogramWorker from "../../workers/SpectrogramWorker";
import { dbtoa, getRuler, hslToRgb } from "../../utils";
import { AudioEditorConfiguration, AudioEditorState } from "../../core/AudioEditor";

export interface SpectrogramResizeOptions {
    resizeFactor: number;
    minWidth: number;
    minHeight: number;
}

export interface ResizedSpectrogram {
    /** the offset from the nearest frame before the startIndex, in samples */
    offsetFromFrame: number;
    samplesPerPixel: number;
    data: Float32Array[][];
    imageBitmaps?: ImageBitmap[][];
}

export interface ResizedSpectrograms {
    resizes: ResizedSpectrogram[];
    sizes: [number, number][];
    resizeOptions: SpectrogramResizeOptions;
}

export interface SpectrogramSliceData {
    /**
     * The process starts from startIndex included of time-domain samples, FFT frame starts before the startIndex with paddings.
     * ```
     * const fftStartIndex = startIndex + hopSize - fftSize;
     * ```
     */
    startIndex: number;
    /**
     * The processe ends to `endIndex` excluded of time-domain samples, FFT frame ends after the `endIndex` with paddings.
     * ```
     * const fftEndIndex = endIndex - hopSize + fftSize;
     * ```
     */
    endIndex: number;
    /**
     * Frequency-domain data of each channels.
     */
    frequencyDomainData: FrequencyDomainChannelData[];
    /**
     * Spectrogram image data of each channels, from `startIndex` to `endIndex`.
     */
    resizedSpectrograms: ResizedSpectrograms;
}

export interface SpectrogramState {
    fftDrawThreshold: number;
}

export interface SpectrogramDrawOptions {
    width: number;
    height: number;
    verticalZoom: number;
    verticalOffset: number;
    gridLabels: boolean;
    fadeInExp: number;
    fadeInTo: number;
    fadeOutExp: number;
    fadeOutFrom: number;
    fade: number;
}

class Spectrogram implements AudioToolkitModule<SpectrogramState> {
    static MODULE_ID = "spectrogram";
    static MODULE_NAME = "Spectrogram";
    static DEFAULT_STATE = {};
    static MAX_BITMAP_SIZE = 1024 * 1024;
    static DB_DRAW_THRESHOLD = -100;
    static async fromAudioData(timeDomainData: Float32Array[], frequencyDomainData: FrequencyDomainChannelData[], sampleRate: number, configuration: AudioEditorConfiguration, { fftDrawThreshold = this.DB_DRAW_THRESHOLD }: Partial<SpectrogramState> = {}, sharableData?: { fftDrawThreshold: number, dataSlices: SpectrogramSliceData[] }) {
        const spectrogram = new Spectrogram(timeDomainData, frequencyDomainData, sampleRate, { fftDrawThreshold });
        if (sharableData) {
            spectrogram._dataSlices = sharableData.dataSlices;
            if (fftDrawThreshold !== sharableData.fftDrawThreshold) spectrogram._dataSlices.forEach(ds => ds.resizedSpectrograms.resizes.forEach(rs => rs.imageBitmaps = []));
        } else {
            const resized = await spectrogram._worker.generateResized(frequencyDomainData, { ...configuration, startIndex: 0, endIndex: spectrogram.length });
            spectrogram._dataSlices = [resized];
        }
        return spectrogram;
    }
    public moduleId = Spectrogram.MODULE_ID;
    public onStateChange: ((newState: SpectrogramState) => any) | undefined;
    public Component = SpectrogramComponent;
    public state: SpectrogramState;
    private _worker = new SpectrogramWorker();
    private _dataSlices: SpectrogramSliceData[] = [];
    get length() {
        return this.timeDomainData[0].length;
    }
    get numberOfChannels() {
        return this.timeDomainData.length;
    }
    private constructor(
        public timeDomainData: Float32Array[],
        public frequencyDomainData: FrequencyDomainChannelData[],
        public sampleRate: number,
        initialState: SpectrogramState
    ) {
        this.state = initialState;
    }

    getState() {
        return this.state;
    }
    setState(newState: SpectrogramState) {
        this.state = newState;
        this.onStateChange?.(newState);
    }
    getSharableData() {
        return {
            ...this.state,
            dataSlices: this._dataSlices
        };
    }
    getBestResizes(targetSamplesPerPixel: number, targetHeight: number): [number, number][] {
        return this._dataSlices.map(({ resizedSpectrograms }) => {
            const width = resizedSpectrograms.sizes.filter((_, i) => resizedSpectrograms.resizes[i].samplesPerPixel < targetSamplesPerPixel).map((([w]) => w)).sort((a, b) => a - b)[0] ?? resizedSpectrograms.sizes[0][0];
            const height = resizedSpectrograms.sizes.filter(([w, h]) => w === width && h > targetHeight).map(([_, h]) => h).sort((a, b) => a - b)[0] ?? resizedSpectrograms.sizes[0][1];
            return [width, height];
        });
    }
    async createBitmap(magnitudes: Float32Array[], dbDrawThreshold = Spectrogram.DB_DRAW_THRESHOLD): Promise<ImageBitmap> {
        const width = magnitudes.length;
        const height = magnitudes[0].length;
        const imageData = new ImageData(width, height);
        let v = 0;
        let n = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let z = 0;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                v = magnitudes[x][height - 1 - y];
                if (v < dbDrawThreshold) continue;
                n = (v - dbDrawThreshold) / -dbDrawThreshold;
                [r, g, b, a] = hslToRgb([n / 2 + 2 / 3, 1, 0.5, n]);
                z = (y * width + x) * 4;
                // z = x * 4;
                imageData.data[z] = ~~(r * 255);
                imageData.data[z + 1] = ~~(g * 255);
                imageData.data[z + 2] = ~~(b * 255);
                imageData.data[z + 3] = ~~(a * 255);
            }
        }
        return createImageBitmap(imageData);
    }
    async getBitmaps(destWidth: number, destHeight: number, $drawFrom: number, $drawTo: number, numberOfChannels: number) {
        const { MAX_BITMAP_SIZE } = Spectrogram;
        const bitmaps: { bitmap: ImageBitmap, drawParams: number[] }[][] = new Array(numberOfChannels).fill(null).map(() => []);
        const overallSamplesPerPixel = ($drawTo - $drawFrom) / destWidth;
        let samplesPerPixel: number;
        /** bitmap start position in samples */
        let $bitmapStart = 0;
        /** bitmap start position in samples per channel */
        let $bitmapStartPerChannel = 0;
        /** bitmap end position in samples per channel */
        let $bitmapEndPerChannel = 0;
        let length: number;
        let w: number;
        let h: number;
        let resizeString: `${number}x${number}`;
        let $bitmap: number;
        let bitmapWidth: number;
        let bitmap: ImageBitmap;
        let sx: number;
        let sw: number;
        let dx: number;
        let dw: number;
        let offsetFromFrameStart: number;
        // let offsetToFFTFrameEnd: number;
        let sliceStart: number;
        const bestResizes = this.getBestResizes(overallSamplesPerPixel, destHeight);
        for (let i = 0; i < this._dataSlices.length; i++) {
            const { startIndex, endIndex, resizedSpectrograms } = this._dataSlices[i];
            length = endIndex - startIndex;
            if ($bitmapStart + length <= $drawFrom) {
                $bitmapStart += length;
                continue;
            }
            if ($bitmapStart >= $drawTo) break;
            [w, h] = bestResizes[i];
            const resize = resizedSpectrograms.resizes[resizedSpectrograms.sizes.findIndex(([_w, _h]) => w === _w && h === _h)];
            if (!resize.imageBitmaps) resize.imageBitmaps = [];
            samplesPerPixel = resize.samplesPerPixel;
            for (let channel = 0; channel < numberOfChannels; channel++) {
                if (!resize.imageBitmaps[channel]) resize.imageBitmaps[channel] = [];
                const magnitudes = resize.data[channel];
                $bitmap = 0;
                $bitmapStartPerChannel = $bitmapStart;
                while ($bitmapStartPerChannel < endIndex) {
                    bitmap = resize.imageBitmaps[channel][$bitmap];
                    offsetFromFrameStart = $bitmap === 0 ? resize.offsetFromFrame : 0;
                    if (bitmap) {
                        bitmapWidth = bitmap.width;
                        $bitmapEndPerChannel = Math.min($bitmapStartPerChannel - offsetFromFrameStart + bitmapWidth * samplesPerPixel, endIndex);
                        // offsetToFFTFrameEnd = $bitmapEndPerChannel === endIndex ? startIndex - offsetFromFFTFrameStart + magnitudes.length * samplesPerPixel - endIndex : 0;
                        if ($bitmapEndPerChannel > $drawFrom) {
                            sx = (Math.max(0, $drawFrom - $bitmapStartPerChannel) + offsetFromFrameStart) / samplesPerPixel;
                            sw = (Math.min($drawTo, $bitmapEndPerChannel) - $bitmapStartPerChannel + offsetFromFrameStart) / samplesPerPixel - sx;
                            dx = Math.max(0, ($bitmapStartPerChannel - $drawFrom) / ($drawTo - $drawFrom) * destWidth);
                            dw = (Math.min($drawTo, $bitmapEndPerChannel) - Math.max($drawFrom, $bitmapStartPerChannel)) / ($drawTo - $drawFrom) * destWidth;
                            bitmaps[channel].push({ bitmap, drawParams: [sx, sw, dx, dw] });
                        }
                    } else {
                        bitmapWidth = Math.min(~~(MAX_BITMAP_SIZE / h), Math.ceil((endIndex - $bitmapStartPerChannel) / samplesPerPixel));
                        $bitmapEndPerChannel = Math.min($bitmapStartPerChannel - offsetFromFrameStart + bitmapWidth * samplesPerPixel, endIndex);
                        if ($bitmapEndPerChannel > $drawFrom) {
                            sliceStart = ~~(($bitmapStartPerChannel - startIndex) / samplesPerPixel);
                            bitmap = await this.createBitmap(magnitudes.slice(sliceStart, sliceStart + bitmapWidth));
                            sx = (Math.max(0, $drawFrom - $bitmapStartPerChannel) + offsetFromFrameStart) / samplesPerPixel;
                            sw = (Math.min($drawTo, $bitmapEndPerChannel) - $bitmapStartPerChannel + offsetFromFrameStart) / samplesPerPixel - sx;
                            dx = Math.max(0, ($bitmapStartPerChannel - $drawFrom) / ($drawTo - $drawFrom) * destWidth);
                            dw = (Math.min($drawTo, $bitmapEndPerChannel) - Math.max($drawFrom, $bitmapStartPerChannel)) / ($drawTo - $drawFrom) * destWidth;
                            bitmaps[channel].push({ bitmap, drawParams: [sx, sw, dx, dw] });
                            resize.imageBitmaps[channel][$bitmap] = bitmap;
                        }
                    }
                    $bitmap++;
                    $bitmapStartPerChannel = $bitmapEndPerChannel;
                }
                
            }
            $bitmapStart = $bitmapStartPerChannel;
            
        }
        return bitmaps;
    }
    async paint(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0, fadeInExp = 1, fadeInTo, fadeOutExp = 1, fadeOutFrom, fade = 0 }: Partial<SpectrogramDrawOptions>,
        { viewRange }: Pick<AudioEditorState, "viewRange">,
        { phosphorColor = "rgb(67, 217, 150)", separatorColor = "grey", playheadColor = "rgba(191, 0, 0)", fadePathColor = "yellow" }: Partial<Pick<VisualizationStyleOptions, "phosphorColor" | "separatorColor" | "playheadColor" | "fadePathColor">> = {}
    ) {
        const { numberOfChannels } = this;

        ctx.clearRect(0, 0, width, height);

        // Grids
        const gridChannels = numberOfChannels;
        const channelHeight = height / gridChannels;

        ctx.beginPath();
        ctx.setLineDash([4, 2]);
        ctx.strokeStyle = separatorColor;
        for (let i = 1; i < gridChannels; i++) {
            ctx.moveTo(0, i * channelHeight);
            ctx.lineTo(width, i * channelHeight);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        // Horizontal Range
        const [$drawFrom, $drawTo] = viewRange; // Draw start-end
        const pixelsPerSample = width / ($drawTo - $drawFrom);
        // const frames = Math.ceil(($1 - $0) / hopSize) + fftOverlap - 1;
        // const framesPerPixel = frames / width;
        // const samplesPerPixel = ($1 - $0) / width;
        // console.log('frames per pixel', framesPerPixel, viewRange);
        const bitmapsData = await this.getBitmaps(width, channelHeight, $drawFrom, $drawTo, numberOfChannels);
        for (let channel = 0; channel < numberOfChannels; channel++) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            // ctx.globalCompositeOperation = "lighter";
            ctx.translate(0, channel * channelHeight);
            for (let i = 0; i < bitmapsData[channel].length; i++) {
                const { bitmap, drawParams: [sx, sw, dx, dw] } = bitmapsData[channel][i];
                ctx.drawImage(
                    bitmap,
                    sx, 0, sw, bitmap.height,
                    dx, 0, dw, channelHeight
                );
            }
            ctx.restore();
        }
        let x: number;
        // cursor
        /*
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
    async paintVerticalRuler(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0, gridLabels = true }: Partial<SpectrogramDrawOptions>,
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
    async paintHorizontalRuler(
        ctx: CanvasRenderingContext2D,
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0, gridLabels = true }: Partial<SpectrogramDrawOptions>,
        _stateAndConfigurations: any,
        { gridColor = "rgb(0, 53, 0)", gridRulerColor = "white", textColor = "white", labelFont = 'Consolas, "Courier New", "SF Mono", Monaco, Menlo, Courier, monospace' }: Partial<Pick<VisualizationStyleOptions, "gridColor" | "gridRulerColor" | "textColor" | "labelFont">> = {}
    ) {
        const { sampleRate, numberOfChannels } = this;
        const halfSampleRate = sampleRate / 2;
        const channelHeight = height / numberOfChannels;
        let coarse: number | undefined;
        let refined: number | undefined;
        const steps = [1, 2, 5];
        let mag = 100;
        let step = 0;
        do {
            const grid = steps[step] * mag;
            if (step + 1 < steps.length) {
                step++;
            } else {
                step = 0;
                mag *= 10;
            }
            if (!coarse && halfSampleRate / grid <= 5) coarse = grid;
            if (!refined && halfSampleRate / grid <= 25) refined = grid;
        } while (!coarse || !refined);
    
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        const right = gridLabels ? 80 : 0;
        const x = width - right;
        let hz = coarse;
        let y: number;
        for (let channel = 0; channel < numberOfChannels; channel++) {
            hz = coarse;
            while (hz < halfSampleRate) {
                y = (channel + 1 - hz / halfSampleRate) * channelHeight;
                ctx.moveTo(0, y);
                ctx.lineTo(x, y);
                hz += coarse;
            }
        }
        ctx.stroke();
        if (!gridLabels) return;
        ctx.strokeStyle = gridRulerColor;
        ctx.fillStyle = textColor;
        ctx.font = `12px ${labelFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("Hz", x + 14, 10);
        ctx.beginPath();
        for (let channel = 0; channel < numberOfChannels; channel++) {
            if (channel !== 0) {
                ctx.moveTo(x, channel * channelHeight);
                ctx.lineTo(width, channel * channelHeight);
            }
            hz = refined;
            while (hz <= halfSampleRate) {
                y = (channel + 1 - hz / halfSampleRate) * channelHeight;
                ctx.moveTo(x, y);
                ctx.lineTo(x + (hz % coarse === 0 ? 10 : 5), y);
                if (hz % coarse === 0) ctx.fillText(hz.toString(), x + 14, y);
                hz += refined;
            }
        }
        ctx.stroke();
    }
}

export default Spectrogram;
