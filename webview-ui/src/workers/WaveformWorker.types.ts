import { WaveformResizeOptions, WaveformSliceData } from "../modules/waveform/Waveform";

export interface IWaveformWorker {
    generateResized(audioData: Float32Array[], options?: Partial<WaveformResizeOptions>): WaveformSliceData;
}
