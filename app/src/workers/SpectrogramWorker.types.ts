import { SpectrogramSliceData } from "../modules/spectrogram/Spectrogram";
import { FrequencyDomainChannelData } from "../core/AudioToolkitModule";
import { STFTOptions } from "../core/STFTProcessor";

export interface ISpectrogramWorkerWorker {
    generateResized(data: FrequencyDomainChannelData[], options: STFTOptions & { startIndex: number; endIndex: number }): SpectrogramSliceData;
}

export interface ISpectrogramWorker {
    updateState(...msg: any[]): void;
}
