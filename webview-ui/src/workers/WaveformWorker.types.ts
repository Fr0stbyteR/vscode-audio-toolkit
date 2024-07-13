import { WaveformData } from "../core/Waveform";

export interface IWaveformWorker {
    generate(buffer: Float32Array[], stepsFactor?: number): WaveformData;
}
