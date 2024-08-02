import { VisualizationOptions, VisualizationStyleOptions } from "../../core/AudioToolkitModule";
import { hslToRgb } from "../../utils";

export interface MatrixResizeOptions {
    resizeFactor: number;
    minWidth: number;
    minHeight: number;
}

export interface ResizedMatrix {
    /** the offset from the nearest frame before the startIndex, in samples */
    offsetFromFrame: number;
    audioSamplesPerFrame: number;
    binsPerPixel: number;
    data: Float32Array[][];
    imageBitmaps?: ImageBitmap[][];
}

export interface ResizedMatrices {
    resizes: ResizedMatrix[];
    sizes: [number, number][];
    resizeOptions: MatrixResizeOptions;
}

export interface MatrixDrawOptions {
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

class MatrixImageProcessor {
    static DEFAULT_RESIZE_FACTOR = 4;
    static DEFAULT_MIN_PIXEL_WIDTH = 4;
    static DEFAULT_MIN_PIXEL_HEIGHT = 128;
    static DB_DRAW_THRESHOLD = -100;
    static MAX_BITMAP_SIZE = 1024 * 1024;
    static generateResized(matrices: Float32Array[][], audioSamplesPerFrame: number, { resizeFactor = this.DEFAULT_MIN_PIXEL_WIDTH, minWidth = this.DEFAULT_MIN_PIXEL_WIDTH, minHeight = this.DEFAULT_MIN_PIXEL_HEIGHT }: Partial<MatrixResizeOptions> = {}) {
        const SharedArrayBuffer = globalThis.SharedArrayBuffer || globalThis.ArrayBuffer;
        const originalSize: [number, number] = [matrices[0].length, matrices[0][0].length];
        let binsPerPixel = 1;
        const [ow, oh] = originalSize;
        const channels = matrices.length;
        const sizes = [originalSize];
        const offsetFromFrame = 0;
        const resizes: ResizedMatrix[] = [{ offsetFromFrame, audioSamplesPerFrame, binsPerPixel, data: matrices }];
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
            binsPerPixel = 1;
            for (h = oh; h >= minHeight; h = Math.ceil(h / resizeFactor)) {
                if (w === ow && h === oh) continue;
                if (h !== oh) binsPerPixel *= resizeFactor;
                size = [w, h];
                sizes.push(size);
                const resize: ResizedMatrix = {
                    offsetFromFrame,
                    audioSamplesPerFrame,
                    binsPerPixel,
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
            const height = resizedMatrices.sizes.filter(([w, h], i) => resizedMatrices.resizes[i].binsPerPixel < targetBinsPerPixel && w === width).map(([_, h]) => h).sort((a, b) => a - b)[0] ?? resizedMatrices.sizes[0][1];
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
        const bitmaps: { bitmap: ImageBitmap, drawParams: number[] }[][] = new Array(numberOfChannels).fill(null).map(() => []);
        const targetAudioSamplesPerPixel = ($drawTo - $drawFrom) / destWidth;
        const targetBinsPerPixel = ($drawToBin - $drawToBin) / destHeight;
        let samplesPerPixel: number;
        let binsPerPixel: number;
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
        const bestResizes = this.getBestResizes(dataSlices, targetAudioSamplesPerPixel, targetBinsPerPixel);
        for (let i = 0; i < dataSlices.length; i++) {
            const { startIndex, endIndex, resizedMatrices } = dataSlices[i];
            [ow, oh] = dataSlices[i].resizedMatrices.sizes[0];
            length = endIndex - startIndex;
            if ($bitmapStart + length <= $drawFrom) {
                $bitmapStart += length;
                continue;
            }
            if ($bitmapStart >= $drawTo) break;
            const resize = resizedMatrices.resizes[bestResizes[i]];
            [w, h] = resizedMatrices.sizes[bestResizes[i]];
            if (!resize.imageBitmaps) resize.imageBitmaps = [];
            samplesPerPixel = resize.audioSamplesPerFrame;
            binsPerPixel = resize.binsPerPixel;
            const calcCoords = () => [
                sx = (Math.max(0, $drawFrom - $bitmapStartPerChannel) + offsetFromFrameStart) / samplesPerPixel,
                sy = Math.max(0, oh - $drawToBin) / binsPerPixel,
                (Math.min($drawTo, $bitmapEndPerChannel) - $bitmapStartPerChannel + offsetFromFrameStart) / samplesPerPixel - sx,
                (oh - Math.max(0, $drawFromBin)) / binsPerPixel - sy,
                Math.max(0, ($bitmapStartPerChannel - $drawFrom) / ($drawTo - $drawFrom) * destWidth),
                Math.max(0, ($drawToBin - oh) / ($drawToBin - $drawFromBin) * destHeight),
                (Math.min($drawTo, $bitmapEndPerChannel) - Math.max($drawFrom, $bitmapStartPerChannel)) / ($drawTo - $drawFrom) * destWidth,
                ((oh - Math.max(0, $drawFromBin)) - Math.max(0, $drawToBin - oh)) / ($drawToBin - $drawFromBin) * destHeight
            ];
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
        { width = ctx.canvas.width, height = ctx.canvas.height, verticalZoom = 1, verticalOffset = 0 }: Partial<MatrixDrawOptions>,
        { viewRange }: Pick<VisualizationOptions<any>, "viewRange">,
        { separatorColor = "grey" }: Partial<Pick<VisualizationStyleOptions, "separatorColor">> = {}
    ) {
        const numberOfChannels = dataSlices[0].resizedMatrices.resizes[0].data.length;
        const [ow, oh] = dataSlices[0].resizedMatrices.sizes[0];
        const $drawFromBin = verticalOffset * oh / verticalZoom;
        const $drawToBin = (verticalOffset + 1) * oh / verticalZoom;

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
        const bitmapsData = await this.getBitmaps(dataSlices, width, channelHeight, $drawFrom, $drawTo, $drawFromBin, $drawToBin, numberOfChannels);
        for (let channel = 0; channel < numberOfChannels; channel++) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            // ctx.globalCompositeOperation = "lighter";
            ctx.translate(0, channel * channelHeight);
            for (let i = 0; i < bitmapsData[channel].length; i++) {
                const { bitmap, drawParams: [sx, sy, sw, sh, dx, dy, dw, dh] } = bitmapsData[channel][i];
                ctx.drawImage(
                    bitmap,
                    sx, sy, sw, sh,
                    dx, dy, dw, dh
                );
            }
            ctx.restore();
        }
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
        let binsPerPixel: number;
        // let resizeFactorHeight: number;
        for (let i = 1; i < sizes.length; i++) {
            [w, h] = sizes[i];
            audioSamplesPerFrame = resizes[i].audioSamplesPerFrame;
            offsetFromFrame = resizes[i].offsetFromFrame;
            binsPerPixel = resizes[i].binsPerPixel;
            resizeFactorWidth = ~~(ow / w);
            // resizeFactorHeight = ~~(oh / h);
            w1 = Math.ceil((splitSample + offsetFromFrame) / audioSamplesPerFrame);
            w2 = Math.ceil(w - (splitSample + offsetFromFrame) / audioSamplesPerFrame);
            sizes1[i] = [w1, h];
            sizes2[i] = [w2, h];
            resized1.resizes[i] = { offsetFromFrame, audioSamplesPerFrame, binsPerPixel, data: resizes[i].data.map(spectrogram => spectrogram.slice(0, w1)) };
            resized2.resizes[i] = { offsetFromFrame: (splitSample + offsetFromFrame) % audioSamplesPerFrame, audioSamplesPerFrame, binsPerPixel, data: resizes[i].data.map(spectrogram => spectrogram.slice(split2From, w)) };
        }
        return [resized1, resized2];
    }
}

export default MatrixImageProcessor;
