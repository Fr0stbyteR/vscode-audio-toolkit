import { VisualizationOptions, VisualizationStyleOptions } from "./AudioToolkitModule";
import { hslToRgb } from "../utils";

export interface MatrixResizeOptions {
    resizeFactor: number;
    minWidth: number;
    minHeight: number;
}

export interface ResizedMatrix {
    /** the offset from the nearest frame before the startIndex, in samples */
    offsetFromFrame: number;
    audioSamplesPerFrame: number;
    binsPerCell: number;
    data: Float32Array[][];
    imageBitmaps?: ImageBitmap[][];
}

export interface ResizedMatrices {
    resizes: ResizedMatrix[];
    sizes: [number, number][];
    resizeOptions: MatrixResizeOptions;
}

export interface MatrixPaintOptions {
    width: number;
    height: number;
    verticalZoom: number;
    verticalOffset: number;
}

export interface MatrixDataSlice {
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
     * Spectrogram image data of each channels, from `startIndex` to `endIndex`.
     */
    resizedMatrices: ResizedMatrices;
}
export interface MatrixCursorInfo {
    x: number;
    y: number;
    value: number;
    channel: number;
    fromIndex: number;
    /** Exclusive */
    toIndex: number;
    fromBin: number;
    /** Exclusive */
    toBin: number;
};

class MatrixImageProcessor {
    static DEFAULT_RESIZE_FACTOR = 4;
    static DEFAULT_MIN_PIXEL_WIDTH = 4;
    static DEFAULT_MIN_PIXEL_HEIGHT = 128;
    static DB_DRAW_THRESHOLD = -100;
    static MAX_BITMAP_SIZE = 1024 * 1024;
    static generateResized(matrices: Float32Array[][], audioSamplesPerFrame: number, { resizeFactor = this.DEFAULT_MIN_PIXEL_WIDTH, minWidth = this.DEFAULT_MIN_PIXEL_WIDTH, minHeight = this.DEFAULT_MIN_PIXEL_HEIGHT }: Partial<MatrixResizeOptions> = {}) {
        const SharedArrayBuffer = globalThis.SharedArrayBuffer || globalThis.ArrayBuffer;
        const originalSize: [number, number] = [matrices[0].length, matrices[0][0].length];
        let binsPerCell = 1;
        const [ow, oh] = originalSize;
        const channels = matrices.length;
        const sizes = [originalSize];
        const offsetFromFrame = 0;
        const resizes: ResizedMatrix[] = [{ offsetFromFrame, audioSamplesPerFrame, binsPerCell, data: matrices }];
        const resized: ResizedMatrices = { sizes, resizeOptions: { resizeFactor, minWidth, minHeight }, resizes };
        // return resized;
        let w: number;
        let h: number;
        let size: [number, number];
        let prevResizedData: Float32Array[][];
        let pw = ow;
        let ph: number;
        let pFrame: number;
        let pBin: number;
        let m: number;
        for (w = ow; w >= minWidth; w = Math.ceil(w / resizeFactor)) {
            if (w !== ow) audioSamplesPerFrame *= resizeFactor;
            ph = oh;
            binsPerCell = 1;
            for (h = oh; h >= minHeight; h = Math.ceil(h / resizeFactor)) {
                if (w === ow && h === oh) continue;
                if (h !== oh) binsPerCell *= resizeFactor;
                size = [w, h];
                sizes.push(size);
                const resize: ResizedMatrix = {
                    offsetFromFrame,
                    audioSamplesPerFrame,
                    binsPerCell,
                    data: new Array(channels).fill(null).map(() => new Array(w).fill(null).map(() => new Float32Array(new SharedArrayBuffer(h * Float32Array.BYTES_PER_ELEMENT)).fill(-Infinity)))
                };
                resizes.push(resize);
                prevResizedData = resizes[sizes.findIndex(([w, h]) => w === pw && h === ph)].data;
                for (let channel = 0; channel < channels; channel++) {
                    for (let frame = 0; frame < w; frame++) {
                        for (let bin = 0; bin < h; bin++) {
                            for (let i = 0; i < resizeFactor; i++) {
                                pFrame = pw === w ? frame : frame * Math.ceil(pw / w) + i;
                                if (pFrame >= pw) break;
                                pBin = ph === h ? bin : bin * Math.ceil(ph / h) + i;
                                if (pBin >= ph) break;
                                m = prevResizedData[channel][pFrame][pBin];
                                if (i === 0 || m > resize.data[channel][frame][bin]) resize.data[channel][frame][bin] = m;
                            }
                        }
                    }
                }
                ph = h;
            }
            pw = w;
        }
        return resized;
    }
    static getBestResizes(dataSlices: MatrixDataSlice[], targetAudioSamplesPerPixel: number, targetBinsPerPixel: number) {
        return dataSlices.map(({ resizedMatrices }) => {
            const width = resizedMatrices.sizes.filter((_, i) => resizedMatrices.resizes[i].audioSamplesPerFrame < targetAudioSamplesPerPixel).map((([w]) => w)).sort((a, b) => a - b)[0] ?? resizedMatrices.sizes[0][0];
            const height = resizedMatrices.sizes.filter(([w, h], i) => resizedMatrices.resizes[i].binsPerCell < targetBinsPerPixel && w === width).map(([_, h]) => h).sort((a, b) => a - b)[0] ?? resizedMatrices.sizes[0][1];
            return resizedMatrices.sizes.findIndex(([w, h]) => w === width && h === height);
        });
    }
    static createBitmap(magnitudes: Float32Array[], dbDrawThreshold = this.DB_DRAW_THRESHOLD): Promise<ImageBitmap> {
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
    static async getBitmaps(dataSlices: MatrixDataSlice[], destWidth: number, destHeight: number, $drawFrom: number, $drawTo: number, $drawFromBin: number, $drawToBin: number, numberOfChannels: number) {
        const { MAX_BITMAP_SIZE } = this;
        const bitmaps: { bitmap: ImageBitmap, drawParams: [number, number, number, number, number, number, number, number] }[][] = new Array(numberOfChannels).fill(null).map(() => []);
        const targetAudioSamplesPerPixel = ($drawTo - $drawFrom) / destWidth;
        const targetBinsPerCell = ($drawToBin - $drawToBin) / destHeight;
        let samplesPerPixel: number;
        let binsPerCell: number;
        /** bitmap start position in samples */
        let $bitmapStart = 0;
        /** bitmap start position in samples per channel */
        let $bitmapStartPerChannel = 0;
        /** bitmap end position in samples per channel */
        let $bitmapEndPerChannel = 0;
        let length: number;
        let ow: number;
        let oh: number;
        let w: number;
        let h: number;
        let $bitmap: number;
        let bitmapWidth: number;
        let bitmapHeight: number;
        let bitmap: ImageBitmap;
        let sx: number;
        let sy: number;
        let offsetFromFrameStart: number;
        // let offsetToFFTFrameEnd: number;
        let sliceStart: number;
        const bestResizesIndex = this.getBestResizes(dataSlices, targetAudioSamplesPerPixel, targetBinsPerCell);
        for (let i = 0; i < dataSlices.length; i++) {
            const { startIndex, endIndex, resizedMatrices } = dataSlices[i];
            [ow, oh] = dataSlices[i].resizedMatrices.sizes[0];
            length = endIndex - startIndex;
            if ($bitmapStart + length <= $drawFrom) {
                $bitmapStart += length;
                continue;
            }
            if ($bitmapStart >= $drawTo) break;
            const resize = resizedMatrices.resizes[bestResizesIndex[i]];
            [w, h] = resizedMatrices.sizes[bestResizesIndex[i]];
            if (!resize.imageBitmaps) resize.imageBitmaps = [];
            samplesPerPixel = resize.audioSamplesPerFrame;
            binsPerCell = resize.binsPerCell;
            const calcCoords = () => [
                sx = (Math.max(0, $drawFrom - $bitmapStartPerChannel) + offsetFromFrameStart) / samplesPerPixel,
                sy = Math.max(0, oh - $drawToBin) / binsPerCell,
                (Math.min($drawTo, $bitmapEndPerChannel) - $bitmapStartPerChannel + offsetFromFrameStart) / samplesPerPixel - sx,
                (oh - Math.max(0, $drawFromBin)) / binsPerCell - sy,
                Math.max(0, ($bitmapStartPerChannel - $drawFrom) / ($drawTo - $drawFrom) * destWidth),
                Math.max(0, ($drawToBin - oh) / ($drawToBin - $drawFromBin) * destHeight),
                (Math.min($drawTo, $bitmapEndPerChannel) - Math.max($drawFrom, $bitmapStartPerChannel)) / ($drawTo - $drawFrom) * destWidth,
                (Math.min(oh, $drawToBin) - Math.max(0, $drawFromBin)) / ($drawToBin - $drawFromBin) * destHeight
            ] as typeof bitmaps[0][0]["drawParams"];
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
                        bitmapHeight = bitmap.height;
                        $bitmapEndPerChannel = Math.min($bitmapStartPerChannel - offsetFromFrameStart + bitmapWidth * samplesPerPixel, endIndex);
                        // offsetToFFTFrameEnd = $bitmapEndPerChannel === endIndex ? startIndex - offsetFromFFTFrameStart + magnitudes.length * samplesPerPixel - endIndex : 0;
                        if ($bitmapEndPerChannel > $drawFrom) {
                            bitmaps[channel].push({ bitmap, drawParams: calcCoords() });
                        }
                    } else {
                        bitmapWidth = Math.min(~~(MAX_BITMAP_SIZE / h), Math.ceil((endIndex - $bitmapStartPerChannel) / samplesPerPixel));
                        $bitmapEndPerChannel = Math.min($bitmapStartPerChannel - offsetFromFrameStart + bitmapWidth * samplesPerPixel, endIndex);
                        if ($bitmapEndPerChannel > $drawFrom) {
                            sliceStart = ~~(($bitmapStartPerChannel - startIndex) / samplesPerPixel);
                            bitmap = await this.createBitmap(magnitudes.slice(sliceStart, sliceStart + bitmapWidth));
                            bitmaps[channel].push({ bitmap, drawParams: calcCoords() });
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
    static async paint(
        ctx: CanvasRenderingContext2D,
        dataSlices: MatrixDataSlice[],
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0 }: Partial<MatrixPaintOptions>,
        { viewRange }: Pick<VisualizationOptions<any>, "viewRange">,
        { separatorColor = "grey" }: Partial<Pick<VisualizationStyleOptions, "separatorColor">> = {}
    ) {
        const numberOfChannels = dataSlices[0].resizedMatrices.resizes[0].data.length;
        const [ow, oh] = dataSlices[0].resizedMatrices.sizes[0];
        const $drawFromBin = verticalOffset / 2 * oh / verticalZoom;
        const $drawToBin = (verticalOffset / 2 + 1) * oh / verticalZoom;
        const channelHeight = height / numberOfChannels;

        ctx.save();
        ctx.clearRect(0, 0, width, height);

        ctx.beginPath();
        ctx.setLineDash([4, 2]);
        ctx.strokeStyle = separatorColor;
        for (let i = 1; i < numberOfChannels; i++) {
            ctx.moveTo(0, i * channelHeight);
            ctx.lineTo(width, i * channelHeight);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        // Horizontal Range
        const [$drawFrom, $drawTo] = viewRange; // Draw start-end
        const bitmapsData = await this.getBitmaps(dataSlices, width, channelHeight, $drawFrom, $drawTo, $drawFromBin, $drawToBin, numberOfChannels);
        for (let channel = 0; channel < numberOfChannels; channel++) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            // ctx.globalCompositeOperation = "lighter";
            ctx.translate(0, channel * channelHeight);
            for (let i = 0; i < bitmapsData[channel].length; i++) {
                const { bitmap, drawParams } = bitmapsData[channel][i];
                ctx.drawImage(bitmap, ...drawParams);
            }
            ctx.restore();
        }
        ctx.restore();
    }
    /**
     * @param resized
     * @param region `[aFrame0, aBin0, aChannel0, aFrame1, aBin1, aChannel1]` all last three elements are end index excluded.
     */
    static updateRegion(resized: ResizedMatrices, region: number[] = []) {
        let [aFrame0, aBin0, aChannel0, aFrame1, aBin1, aChannel1] = region;
        const { sizes } = resized;
        const [[ow, oh]] = sizes;
        const spectrogram = resized.resizes[0].data;
        const channels = spectrogram.length;
        aFrame0 ??= 0;
        aFrame1 ??= ow;
        aBin0 ??= 0;
        aBin1 ??= oh;
        aChannel0 ??= 0;
        aChannel1 ??= channels;
        let w: number;
        let h: number;
        let x: number;
        let y: number;
        let m: number;
        let x0: number;
        let y0: number;
        let x1: number;
        let y1: number;
        let resize: ResizedMatrix;
        for (let i = 0; i < sizes.length; i++) {
            [w, h] = sizes[i];
            resize = resized.resizes[sizes.findIndex(([_w, _h]) => w === _w && h === _h)];
            x0 = ~~(aFrame0 / ow * w);
            y0 = ~~(aBin0 / oh * h);
            x1 = Math.ceil(aFrame1 / ow * w);
            y1 = Math.ceil(aBin1 / oh * h);
            for (let channel = aChannel0; channel < aChannel1; channel++) {
                for (let frame = x0; frame < x1; frame++) {
                    x = ~~(frame / ow * w);
                    for (let bin = y0; bin < y1; bin++) {
                        y = ~~(bin / oh * h);
                        m = spectrogram[channel][frame][bin];
                        if (bin === 0 || m > resize.data[channel][x][y]) resize.data[channel][x][y] = m;
                    }
                }
            }
        }
        return resized;
    }
    static getInfoFromCursor(
        dataSlices: MatrixDataSlice[],
        x: number, y: number,
        { width, height, verticalZoom = 1, verticalOffset = 0 }: Partial<MatrixPaintOptions> & Pick<MatrixPaintOptions, "width" | "height">,
        { viewRange }: Pick<VisualizationOptions<any>, "viewRange">
    ): MatrixCursorInfo {
        const numberOfChannels = dataSlices[0].resizedMatrices.resizes[0].data.length;
        const channelHeight = height / numberOfChannels;
        const [ow, oh] = dataSlices[0].resizedMatrices.sizes[0];
        const $drawFromBin = verticalOffset / 2 * oh / verticalZoom;
        const $drawToBin = (verticalOffset / 2 + 1) * oh / verticalZoom;
        const [$drawFrom, $drawTo] = viewRange; // Draw start-end
        const pixelsPerAudioSample = width / ($drawTo - $drawFrom);
        const targetAudioSamplesPerPixel = 1 / pixelsPerAudioSample;
        const pixelsPerBin = channelHeight / ($drawToBin - $drawFromBin);
        const targetBinsPerPixel = 1 / pixelsPerBin;
        const channel = Math.max(0, Math.min(numberOfChannels - 1, ~~(y / channelHeight)));
        const $ = Math.max($drawFrom, Math.min($drawTo - 1, $drawFrom + x * targetAudioSamplesPerPixel));
        const $bin = Math.max($drawFromBin, Math.min($drawToBin - 1, $drawToBin - 1 - (y - channel * channelHeight) * targetBinsPerPixel));
        const calcX = ($: number) => ($ - $drawFrom) * pixelsPerAudioSample;
        const calcY = ($bin: number, channel: number) => ($drawToBin - 1 - $bin) * pixelsPerBin + channel * channelHeight;
        const get$ = ($dataSlice: number, $resize: number, $vector: number) => {
            const { startIndex, resizedMatrices } = dataSlices[$dataSlice];
            const resize = resizedMatrices.resizes[$resize];
            return startIndex - resize.offsetFromFrame + $vector * resize.audioSamplesPerFrame;
        };
        const get$bin = ($dataSlice: number, $resize: number, $cell: number) => {
            const { resizedMatrices } = dataSlices[$dataSlice];
            const resize = resizedMatrices.resizes[$resize];
            return $cell * resize.binsPerCell;
        };
        const bestResizesIndex = this.getBestResizes(dataSlices, targetAudioSamplesPerPixel, targetBinsPerPixel);
        const $dataSlice = dataSlices.findIndex(({ startIndex, endIndex }) => startIndex <= $ && $ < endIndex);
        const $resize = bestResizesIndex[$dataSlice];
        const { startIndex, endIndex, resizedMatrices } = dataSlices[$dataSlice];
        const { data, audioSamplesPerFrame, binsPerCell, offsetFromFrame } = resizedMatrices.resizes[$resize];
        const [w, h] = resizedMatrices.sizes[$resize];
        const $vector = Math.max(0, Math.min(w - 1, ~~(($ - (startIndex - offsetFromFrame)) / audioSamplesPerFrame)));
        const $cell = Math.max(0, Math.min(h - 1, ~~($bin / binsPerCell)));
        const fromIndex = get$($dataSlice, $resize, $vector);
        const toIndex = Math.min(endIndex, $drawTo, fromIndex + audioSamplesPerFrame);
        const fromBin = get$bin($dataSlice, $resize, $cell);
        const toBin = Math.min(oh, $drawToBin, fromBin + binsPerCell);
        const value = data[channel][$vector][$cell];
        const xx = calcX(fromIndex) + 0.5 * pixelsPerAudioSample * audioSamplesPerFrame;
        const yy = calcY(fromBin, channel) + 0.5 * pixelsPerBin * binsPerCell;
        return { x: xx, y: yy, channel, fromIndex, toIndex, fromBin, toBin, value };
    }
    /**
     * @param resized
     * @param splitSample
     */
    static split(resized: ResizedMatrices, splitSample: number) {
        const { sizes, resizeOptions, resizes } = resized;
        const [[ow, oh]] = sizes;
        const sizes1: [number, number][] = [[splitSample, oh]];
        const sizes2: [number, number][] = [[ow - splitSample, oh]];
        const resized1: ResizedMatrices = { sizes: sizes1, resizeOptions, resizes: [] };
        const resized2: ResizedMatrices = { sizes: sizes2, resizeOptions, resizes: [] };
        let w: number;
        let w1: number;
        let w2: number;
        let split2From: number;
        let h: number;
        let resizeFactorWidth: number;
        let audioSamplesPerFrame: number;
        let offsetFromFrame: number;
        let binsPerCell: number;
        // let resizeFactorHeight: number;
        for (let i = 1; i < sizes.length; i++) {
            [w, h] = sizes[i];
            audioSamplesPerFrame = resizes[i].audioSamplesPerFrame;
            offsetFromFrame = resizes[i].offsetFromFrame;
            binsPerCell = resizes[i].binsPerCell;
            resizeFactorWidth = ~~(ow / w);
            // resizeFactorHeight = ~~(oh / h);
            w1 = Math.ceil((splitSample + offsetFromFrame) / audioSamplesPerFrame);
            w2 = Math.ceil(w - (splitSample + offsetFromFrame) / audioSamplesPerFrame);
            sizes1[i] = [w1, h];
            sizes2[i] = [w2, h];
            resized1.resizes[i] = { offsetFromFrame, audioSamplesPerFrame, binsPerCell, data: resizes[i].data.map(spectrogram => spectrogram.slice(0, w1)) };
            resized2.resizes[i] = { offsetFromFrame: (splitSample + offsetFromFrame) % audioSamplesPerFrame, audioSamplesPerFrame, binsPerCell, data: resizes[i].data.map(spectrogram => spectrogram.slice(split2From, w)) };
        }
        return [resized1, resized2];
    }
}

export default MatrixImageProcessor;
