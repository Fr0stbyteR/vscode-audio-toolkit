import * as WindowFunction from "window-function";
import type { FFT } from "@shren/fftw-js/dist/esm-bundle";
import { TWindowFunction } from "../window-function.types";
import windowEnergyFactor from "../windowEnergy";

export interface STFTOptions {
    fftSize: number;
    fftOverlap: number;
    fftWindowFunction: string;
    includePhase?: boolean;
    contextPadding?: boolean;
}

const windows = new Map<string, Float64Array>();
function getWindow(size: number, name: string) {
    const fn = WindowFunction[name as TWindowFunction];
    if (typeof fn !== "function") return undefined;
    const key = `${size}:${name}`;
    let coefficients = windows.get(key);
    if (!coefficients) {
        coefficients = Float64Array.from({ length: size }, (_, i) => fn(i, size));
        if (windows.size >= 8) windows.delete(windows.keys().next().value!);
        windows.set(key, coefficients);
    }
    return coefficients;
}

export function allocateFrames(frames: number, bins: number): Float32Array[] {
    const Buffer = globalThis.SharedArrayBuffer || globalThis.ArrayBuffer;
    const buffer = new Buffer(frames * bins * Float32Array.BYTES_PER_ELEMENT);
    return Array.from({ length: frames }, (_, i) => new Float32Array(buffer, i * bins * 4, bins));
}

class STFTProcessor {
    static forward(FFT: new (size: number) => FFT, array: Float32Array) {
        const fft = new FFT(array.length);
        try { return fft.forward(array).slice(); }
        finally { fft.dispose(); }
    }
    static inverse(FFT: new (size: number) => FFT, array: Float32Array) {
        const fft = new FFT(array.length);
        try { return fft.inverse(array).slice(); }
        finally { fft.dispose(); }
    }
    static stft(FFT: new (size: number) => FFT, array: Float32Array, { fftSize, fftOverlap, fftWindowFunction, startIndex = 0, endIndex = array.length, includePhase = true, contextPadding = false }: STFTOptions & Partial<{ startIndex: number; endIndex: number }>) {
        if (!Number.isSafeInteger(fftSize) || fftSize < 2 || fftSize % 2 || !Number.isSafeInteger(fftOverlap) || fftOverlap < 1 || fftOverlap > fftSize) throw new Error("Invalid FFT size or overlap");
        if (!Number.isSafeInteger(startIndex) || !Number.isSafeInteger(endIndex) || startIndex < 0 || endIndex < startIndex || endIndex > array.length) throw new Error("Invalid STFT sample range");
        const coefficients = getWindow(fftSize, fftWindowFunction);
        const currentWindowEnergyFactor = windowEnergyFactor[fftWindowFunction as TWindowFunction] ?? 1;
        const { length } = array;
        const hopSize = ~~(fftSize / fftOverlap);
        const bins = fftSize / 2 + 1;
        // Virtual padding preserves the existing spectrogram's timing without
        // allocating/copying an entire second PCM buffer in the worker.
        const padding = contextPadding ? hopSize * (fftOverlap - 1) : 0;
        const fftFrames = Math.ceil((endIndex - startIndex + 2 * padding) / hopSize);
        const magnitudes = allocateFrames(fftFrames, bins);
        const phases = includePhase ? allocateFrames(fftFrames, bins) : [];
        const fft = new FFT(fftSize);
        const scale = currentWindowEnergyFactor / fftSize;
        let $start = startIndex + hopSize - fftSize - padding;
        let $end = $start + fftSize;
        let real: number;
        let imag: number;
        try {
            for (let frame = 0; frame < fftFrames; frame++) {
                const magnitude = magnitudes[frame];
                const phase = phases[frame];
                const fftResult = fft.forward((input) => {
                    const left = Math.max(0, $start), right = Math.min(length, $end);
                    if ($start < 0 || $end > length) input.fill(0);
                    if (right > left) input.set(array.subarray(left, right), left - $start);
                    if (coefficients) for (let i = 0; i < fftSize; i++) input[i] *= coefficients[i];
                });
                for (let bin = 0; bin < bins; bin++) {
                    real = fftResult[bin];
                    imag = (bin === 0 || bin === fftSize / 2) ? 0 : fftResult[fftSize - bin];
                    magnitude[bin] = Math.hypot(real, imag) * scale;
                    if (phase) phase[bin] = Math.atan2(imag, real);
                }
                $start += hopSize;
                $end += hopSize;
            }
        } finally { fft.dispose(); }

        return { magnitudes, phases };
    }
}

export default STFTProcessor;
