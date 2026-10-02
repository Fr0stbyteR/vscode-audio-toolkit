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
        return STFTProcessor.stft(this.FFT1D, array, { ...options, contextPadding: true });
    }
    getTransferables(value: any): Transferable[] {
        // Only transfer owned STFT output banks, never the caller's PCM or the
        // WASM heap. SharedArrayBuffers are already shared and not transferable.
        if (!value?.magnitudes) return [];
        return [...new Set<ArrayBuffer>([...value.magnitudes, ...value.phases].map((row: Float32Array) => row.buffer).filter((buffer: ArrayBufferLike) => buffer instanceof ArrayBuffer))];
    }
    istft(input: FrequencyDomainChannelData, overlaps: number, lengthIn?: number): Float32Array | null {
        throw new Error("Not implemented");
    }
}

new STFTWorkerWorker();
