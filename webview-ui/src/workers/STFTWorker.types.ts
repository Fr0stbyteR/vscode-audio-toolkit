
import { FrequencyDomainChannelData } from "../core/AudioToolkitModule";
import { STFTOptions } from "../core/STFTProcessor";

export interface ISTFTWorkerWorker {
    init(): Promise<true>;
    forward(array: Float32Array): Float32Array;
    stft(array: Float32Array, options: STFTOptions): FrequencyDomainChannelData;
    inverse(array: Float32Array): Float32Array;
    istft(input: FrequencyDomainChannelData, overlaps: number, lengthIn?: number): Float32Array | null;
}

export interface ISTFTWorker {
    updateState(...msg: any[]): void;
}
