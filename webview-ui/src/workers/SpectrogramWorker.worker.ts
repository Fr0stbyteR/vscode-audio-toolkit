
import ProxyWorker from "./ProxyWorker";
import { ISpectrogramWorker, ISpectrogramWorkerWorker } from "./SpectrogramWorker.types";
import MatrixImageProcessor from "../core/MatrixImageProcessor";
import { STFTOptions } from "../core/STFTProcessor";
import { SpectrogramSliceData } from "../modules/spectrogram/Spectrogram";
import { FrequencyDomainChannelData } from "../core/AudioToolkitModule";
import { atodb } from "../utils";

class SpectrogramWorkerWorker extends ProxyWorker<ISpectrogramWorkerWorker, ISpectrogramWorker> implements ISpectrogramWorkerWorker {
    static fnNames: (keyof ISpectrogramWorker)[] = ["updateState"];
    generateResized(frequencyDomainData: FrequencyDomainChannelData[], options: STFTOptions & { startIndex: number; endIndex: number }) {
        const SharedArrayBuffer = globalThis.SharedArrayBuffer || globalThis.ArrayBuffer;
        const { fftSize, fftOverlap, startIndex, endIndex } = options;
        const hopSize = ~~(fftSize / fftOverlap);
        const spectrogramFrames = Math.ceil((endIndex - startIndex) / hopSize);
        const bins = fftSize / 2 + 1;
        const spectrograms: Float32Array[][] = [];
        const offsetFromFFTFrame = 0;
        let m: number;
        for (let channel = 0; channel < frequencyDomainData.length; channel++) {
            const { magnitudes } = frequencyDomainData[channel];
            const spectrogram = new Array(spectrogramFrames).fill(null).map(() => new Float32Array(new SharedArrayBuffer(bins * Float32Array.BYTES_PER_ELEMENT)));
            for (let frame = 0; frame < spectrogramFrames; frame++) {
                for (let bin = 0; bin < bins; bin++) {
                    m = 0;
                    for (let overlap = 0; overlap < fftOverlap; overlap++) {
                        m += magnitudes[frame + overlap][bin];
                    }
                    spectrogram[frame][bin] = atodb(m / fftOverlap);
                }
            }
            spectrograms[channel] = spectrogram;
        }
        const resizedSpectrograms = MatrixImageProcessor.generateResized(spectrograms, hopSize);
        return { startIndex, endIndex, offsetFromFFTFrame, frequencyDomainData, resizedMatrices: resizedSpectrograms } as SpectrogramSliceData;
    }    
}

new SpectrogramWorkerWorker();
