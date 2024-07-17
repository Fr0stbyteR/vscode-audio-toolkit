import { ResizedSpectrogram, ResizedSpectrograms } from "./Spectrogram";
import { STFTOptions } from "./STFTProcessor";

export interface ResizeOptions {
    resizeFactor: number;
    minWidth: number;
    minHeight: number;
}

class SpectrogramProcessor {
    static DEFAULT_RESIZE_FACTOR = 4;
    static DEFAULT_MIN_PIXEL_WIDTH = 4;
    static DEFAULT_MIN_PIXEL_HEIGHT = 128;
    static generateResized(spectrogram: Float32Array[][], stftOptions: STFTOptions, { resizeFactor = this.DEFAULT_MIN_PIXEL_WIDTH, minWidth = this.DEFAULT_MIN_PIXEL_WIDTH, minHeight = this.DEFAULT_MIN_PIXEL_HEIGHT }: Partial<ResizeOptions> = {}) {
        const SharedArrayBuffer = globalThis.ArrayBuffer || globalThis.SharedArrayBuffer;
        const originalSize: [number, number] = [spectrogram[0].length, spectrogram[0][0].length];
        const [ow, oh] = originalSize;
        const channels = spectrogram.length;
        const sizes = [originalSize];
        const offsetFromFrame = 0;
        let samplesPerPixel = stftOptions.fftSize / stftOptions.fftOverlap;
        const resizes: ResizedSpectrogram[] = [{ offsetFromFrame, samplesPerPixel, data: spectrogram }];
        const resized: ResizedSpectrograms = { sizes, resizeOptions: { resizeFactor, minWidth, minHeight }, resizes };
        // sreturn resized;
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
            if (w !== ow) samplesPerPixel *= resizeFactor;
            ph = oh;
            for (h = oh; h >= minHeight; h = Math.ceil(h / resizeFactor)) {
                if (w === ow && h === oh) continue;
                size = [w, h];
                sizes.push(size);
                const resize: ResizedSpectrogram = {
                    offsetFromFrame,
                    samplesPerPixel,
                    data: new Array(channels).fill(null).map(() => new Array(w).fill(null).map(() => new Float32Array(new SharedArrayBuffer(h * Float32Array.BYTES_PER_ELEMENT)).fill(-Infinity)))
                };
                resizes.push(resize);
                prevResizedData = resizes[sizes.findIndex(([w, h]) => w === pw && h === ph)].data;
                for (let channel = 0; channel < channels; channel++) {
                    for (let frame = 0; frame < w; frame++) {
                        for (let bin = 0; bin < h; bin++) {
                            for (let i = 0; i < resizeFactor; i++) {
                                pFrame = frame * Math.ceil(pw / w) + i;
                                if (pFrame >= pw) break;
                                pBin = bin * Math.ceil(ph / h) + i;
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
        /*
        let x: number;
        let y: number;
        for ([w, h] of resizes) {
            sizeString = sizeStringMap[w][h];
            for (let channel = 0; channel < channels; channel++) {
                for (let frame = 0; frame < ow; frame++) {
                    x = ~~(frame / ow * w);
                    for (let bin = 0; bin < oh; bin++) {
                        y = ~~(bin / oh * h);
                        m = spectrograms[channel][frame][bin];
                        if (bin === 0 || m > resized[sizeString].data[channel][x][y]) resized[sizeString].data[channel][x][y] = m;
                    }
                }
            }
        }
        */
        return resized;
    }
    /**
     * @param resized
     * @param region `[aFrame0, aBin0, aChannel0, aFrame1, aBin1, aChannel1]` all last three elements are end index excluded.
     */
    static updateRegion(resized: ResizedSpectrograms, region: number[] = []) {
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
        let resize: ResizedSpectrogram;
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
    static split(resized: ResizedSpectrograms, splitSample: number) {
        const { sizes, resizeOptions, resizes } = resized;
        const [[ow, oh]] = sizes;
        const sizes1: [number, number][] = [[splitSample, oh]];
        const sizes2: [number, number][] = [[ow - splitSample, oh]];
        const resized1: ResizedSpectrograms = { sizes: sizes1, resizeOptions, resizes: [] };
        const resized2: ResizedSpectrograms = { sizes: sizes2, resizeOptions, resizes: [] };
        let w: number;
        let w1: number;
        let w2: number;
        let split2From: number;
        let h: number;
        let resizeFactorWidth: number;
        let samplesPerPixel: number;
        let offsetFromFrame: number;
        // let resizeFactorHeight: number;
        for (let i = 1; i < sizes.length; i++) {
            [w, h] = sizes[i];
            samplesPerPixel = resizes[i].samplesPerPixel;
            offsetFromFrame = resizes[i].offsetFromFrame;
            resizeFactorWidth = ~~(ow / w);
            // resizeFactorHeight = ~~(oh / h);
            w1 = Math.ceil((splitSample + offsetFromFrame) / samplesPerPixel);
            w2 = Math.ceil(w - (splitSample + offsetFromFrame) / samplesPerPixel);
            sizes1[i] = [w1, h];
            sizes2[i] = [w2, h];
            resized1.resizes[i] = { offsetFromFrame, samplesPerPixel, data: resizes[i].data.map(spectrogram => spectrogram.slice(0, w1)) };
            resized2.resizes[i] = { offsetFromFrame: (splitSample + offsetFromFrame) % samplesPerPixel, samplesPerPixel, data: resizes[i].data.map(spectrogram => spectrogram.slice(split2From, w)) };
        }
        return [resized1, resized2];
    }
}

export default SpectrogramProcessor;
