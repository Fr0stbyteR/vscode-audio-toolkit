import { VectorDataSlice, VectorResizeOptions } from "../core/VectorImageProcessor";

export interface IWaveformWorker {
    generateResized(audioData: Float32Array[], options: Partial<VectorResizeOptions> & { startIndex: number; endIndex: number }): Omit<VectorDataSlice, "vectors">;
}
