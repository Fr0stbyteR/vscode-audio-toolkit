import { WaveformResizeOptions, WaveformSliceData } from "../core/Waveform";

export interface IWaveformWorker {
    generateResized(audioData: Float32Array[], options?: Partial<WaveformResizeOptions>): WaveformSliceData;
}
