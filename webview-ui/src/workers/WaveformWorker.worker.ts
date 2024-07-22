import { IWaveformWorker } from "./WaveformWorker.types";
import { WaveformResizeOptions } from "../modules/waveform/Waveform";
import ProxyWorker from "./ProxyWorker";
import WaveformProcessor from "../modules/waveform/WaveformProcessor";

class Waveform extends ProxyWorker<IWaveformWorker> implements IWaveformWorker {
    generateResized(audioData: Float32Array[], options: Partial<WaveformResizeOptions> = {}) {
        return WaveformProcessor.generateResized(audioData, options);
    }
}

new Waveform();
