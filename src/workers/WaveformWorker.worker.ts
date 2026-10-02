import { IWaveformWorker } from "./WaveformWorker.types";
import ProxyWorker from "./ProxyWorker";
import VectorImageProcessor, { VectorDataSlice, VectorResizeOptions } from "../core/VectorImageProcessor";

class Waveform extends ProxyWorker<IWaveformWorker> implements IWaveformWorker {
    generateResized(audioData: Float32Array[], options: Partial<VectorResizeOptions> & { startIndex: number; endIndex: number }) {
        const { startIndex, endIndex } = options;
        const resizedVectors = VectorImageProcessor.generateResized(audioData, 1, options);
        return { startIndex, endIndex, offsetFromSample: 0, audioSamplesPerSample: 1, resizedVectors } as Omit<VectorDataSlice, "vectors">;
    }
}

new Waveform();
