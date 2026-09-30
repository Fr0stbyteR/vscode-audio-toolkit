import { instantiateFFTWModule, FFTWModule, FFTW } from "@shren/fftw-js/dist/esm-bundle";
import ProxyWorker from "./ProxyWorker";
import { ISTFTWorker, ISTFTWorkerWorker } from "./STFTWorker.types";
import STFTProcessor, { STFTOptions } from "../core/STFTProcessor";
import { FrequencyDomainChannelData } from "../core/AudioToolkitModule";

class STFTWorkerWorker extends ProxyWorker<ISTFTWorkerWorker, ISTFTWorker> implements ISTFTWorkerWorker {
    static fnNames: (keyof ISTFTWorker)[] = ["updateState"];
    fftwModule!: FFTWModule;
    fftw!: FFTW;
    private get FFT1D() {
        return this.fftw.r2r.FFT1D;
    }
    async init(): Promise<true> {
        this.fftwModule = await instantiateFFTWModule();
        this.fftw = new FFTW(this.fftwModule);
        return true;
    }
    forward(array: Float32Array) {
        return STFTProcessor.forward(this.FFT1D, array);
    }
    inverse(array: Float32Array) {
        return STFTProcessor.inverse(this.FFT1D, array);
    }
    stft(array: Float32Array, options: STFTOptions & Partial<{ startIndex: number; endIndex: number }>) {
        const SharedArrayBuffer = globalThis.SharedArrayBuffer || globalThis.ArrayBuffer;
        const { fftSize, fftOverlap, startIndex = 0, endIndex = array.length } = options;
        const hopSize = ~~(fftSize / fftOverlap);
        const padLength = hopSize * (fftOverlap - 1);
        const paddedStartIndex = startIndex - padLength;
        const paddedEndIndex = endIndex + padLength;
        const paddedInput = new Float32Array(new SharedArrayBuffer((paddedEndIndex - paddedStartIndex) * Float32Array.BYTES_PER_ELEMENT));
        if (paddedStartIndex > 0 && paddedEndIndex < array.length) paddedInput.set(array.subarray(paddedStartIndex, paddedStartIndex));
        else if (paddedStartIndex > 0) paddedInput.set(array.subarray(paddedStartIndex));
        else if (paddedEndIndex < array.length) paddedInput.set(array.subarray(0, paddedEndIndex), -paddedStartIndex);
        else paddedInput.set(array, -paddedStartIndex);
        return STFTProcessor.stft(this.FFT1D, paddedInput, options);
    }
    istft(input: FrequencyDomainChannelData, overlaps: number, lengthIn?: number): Float32Array | null {
        throw new Error("Not implemented");
    }
}

new STFTWorkerWorker();
