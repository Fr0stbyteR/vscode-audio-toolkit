import { instantiateFFTWModule, FFTWModule, FFTW } from "@shren/fftw-js/dist/esm-bundle";
import ProxyWorker from "./ProxyWorker";
import { ISpectrogramWorker, ISpectrogramWorkerWorker } from "./SpectrogramWorker.types";
import SpectrogramImageProcessor from "../core/SpectrogramProcessor";
import STFTProcessor, { STFTOptions } from "../core/STFTProcessor";
import { FrequencyDomainChannelData, SpectrogramSliceData } from "../core/Spectrogram";

class SpectrogramWorkerWorker extends ProxyWorker<ISpectrogramWorkerWorker, ISpectrogramWorker> implements ISpectrogramWorkerWorker {
    static fnNames: (keyof ISpectrogramWorker)[] = ["updateState"];
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
        return STFTProcessor.stft(this.FFT1D, array, options);
    }
    generateResized(array: Float32Array[], options: STFTOptions) {
        const startIndex = 0;
        const endIndex = array[0].length;
        const offsetFromFFTFrame = 0;
        const frequencyDomainData: FrequencyDomainChannelData[] = [];
        const spectrograms: Float32Array[][] = [];
        for (let channel = 0; channel < array.length; channel++) {
            const { magnitudes, phases, spectrogram } = this.stft(array[channel], { ...options, startIndex, endIndex });
            frequencyDomainData[channel] = { magnitudes, phases };
            spectrograms[channel] = spectrogram;
        }
        const resizedSpectrograms = SpectrogramImageProcessor.generateResized(spectrograms, options);
        return { startIndex, endIndex, offsetFromFFTFrame, frequencyDomainData, resizedSpectrograms } as SpectrogramSliceData;
    }    
}

new SpectrogramWorkerWorker();
