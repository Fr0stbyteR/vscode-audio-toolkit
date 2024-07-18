import * as WindowFunction from "window-function";
import apply from "window-function/apply";
import { FFT } from "@shren/fftw-js/dist/esm-bundle";
import { TWindowFunction } from "../window-function.types";
import windowEnergyFactor from "../windowEnergy";
import { atodb } from "../utils";

export interface STFTOptions {
    fftSize: number;
    fftOverlap: number;
    fftWindowFunction: string;
    fftDrawThreshold: number;
}

class STFTProcessor {
    static forward(FFT: new (size: number) => FFT, array: Float32Array) {
        const fft = new FFT(array.length);
        const result = fft.forward(array);
        fft.dispose();
        return result;
    }
    static inverse(FFT: new (size: number) => FFT, array: Float32Array) {
        const fft = new FFT(array.length);
        const result = fft.inverse(array);
        fft.dispose();
        return result;
    }
    static stft(FFT: new (size: number) => FFT, array: Float32Array, { fftSize, fftOverlap, fftWindowFunction, startIndex = 0, endIndex = array.length }: STFTOptions & Partial<{ startIndex: number; endIndex: number }>) {
        const SharedArrayBuffer = globalThis.SharedArrayBuffer || globalThis.ArrayBuffer;
        const windowFunction = WindowFunction[fftWindowFunction as TWindowFunction] ?? null;
        const currentWindowEnergyFactor = windowEnergyFactor[fftWindowFunction as TWindowFunction] ?? 1;
        const { length } = array;
        const fft = new FFT(fftSize);
        const hopSize = ~~(fftSize / fftOverlap);
        const bins = fftSize / 2 + 1;
        const spectrogramFrames = Math.ceil((endIndex - startIndex) / hopSize);
        const fftStartIndex = startIndex + hopSize - fftSize;
        const fftFrames = Math.ceil((endIndex - fftStartIndex - hopSize + fftSize) / hopSize);
        // const fftEndIndex = fftStartIndex + fftFrames * hopSize;

        const magnitudes: Float32Array[] = new Array(fftFrames).fill(null).map(() => new Float32Array(new SharedArrayBuffer(bins * Float32Array.BYTES_PER_ELEMENT)));
        const phases: Float32Array[] = new Array(fftFrames).fill(null).map(() => new Float32Array(new SharedArrayBuffer(bins * Float32Array.BYTES_PER_ELEMENT)));
        const spectrogram: Float32Array[] = new Array(spectrogramFrames).fill(null).map(() => new Float32Array(new SharedArrayBuffer(bins * Float32Array.BYTES_PER_ELEMENT)));
        let $start = fftStartIndex;
        let $end = $start + fftSize;
        let real: number;
        let imag: number;
        for (let frame = 0; frame < fftFrames; frame++) {
            const magnitude = magnitudes[frame];
            const phase = phases[frame];
            const fftResult = fft.forward((input) => {
                if ($start < 0) {
                    if ($end > length) {
                        input.set(array, -$start);
                    } else {
                        input.set(array.subarray(0, $end), -$start);
                    }
                } else {
                    if ($end > length) {
                        input.fill(0);
                        input.set(array.subarray($start, length));
                    } else {
                        input.set(array.subarray($start, $end));
                    }
                }
                if (windowFunction) apply(input, windowFunction);
            });
            for (let bin = 0; bin < bins; bin++) {
                real = fftResult[bin];
                imag = (bin === 0 || bin === fftSize / 2) ? 0 : fftResult[fftSize - bin];
                // m = Math.hypot(real, imag) / fftSize * currentWindowEnergyFactor;// / overlaps;
                magnitude[bin] = Math.hypot(real, imag) / fftSize * currentWindowEnergyFactor;
                phase[bin] = Math.atan2(imag, real);
            }
            $start += hopSize;
            $end += hopSize;
        }
        fft.dispose();

        let m: number;
        for (let frame = 0; frame < spectrogramFrames; frame++) {
            for (let bin = 0; bin < bins; bin++) {
                m = 0;
                for (let overlap = 0; overlap < fftOverlap; overlap++) {
                    m += magnitudes[frame + overlap][bin];
                }
                spectrogram[frame][bin] = atodb(m / fftOverlap);
            }
        }
        return { magnitudes, phases, spectrogram };
    }
}

export default STFTProcessor;
