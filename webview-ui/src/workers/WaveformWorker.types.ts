import { VectorDataSlice, VectorResizeOptions } from "../modules/waveform/VectorImageProcessor";

export interface IWaveformWorker {
    generateResized(audioData: Float32Array[], options: Partial<VectorResizeOptions> & { startIndex: number; endIndex: number }): Omit<VectorDataSlice, "vectors">;
}
