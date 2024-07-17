import { FrequencyDomainChannelData, SpectrogramSliceData } from "../core/Spectrogram";
import { STFTOptions } from "../core/STFTProcessor";

export interface ISpectrogramWorkerWorker {
    init(): Promise<true>;
    forward(array: Float32Array): Float32Array;
    stft(array: Float32Array, options: STFTOptions & Partial<{ startIndex: number; endIndex: number }>): FrequencyDomainChannelData & { spectrogram: Float32Array[] };
    updateSpectrogramData(buffer: Float32Array[], spectrogramData: SpectrogramSliceData, options: STFTOptions, from?: number, to?: number, stepsFactor?: number): Promise<SpectrogramSliceData>;
    generateResized(array: Float32Array[], options: STFTOptions): SpectrogramSliceData;
    inverse(array: Float32Array): Float32Array;
    inverses(input: FrequencyDomainChannelData, overlaps: number, lengthIn?: number): Float32Array | null;
}

export interface ISpectrogramWorker {
    updateState(...msg: any[]): void;
}
