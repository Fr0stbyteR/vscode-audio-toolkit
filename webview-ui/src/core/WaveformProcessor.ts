import { WaveformResizeOptions, ResizedWaveform, WaveformSliceData } from "./Waveform";

class WaveformProcessor {
    static DEFAULT_RESIZE_FACTOR = 4;
    static DEFAULT_MIN_WIDTH = 4;
    
    static generateResized(audioData: Float32Array[], { resizeFactor = this.DEFAULT_RESIZE_FACTOR, minWidth = this.DEFAULT_MIN_WIDTH }: Partial<WaveformResizeOptions> = {}) {
        const SharedArrayBuffer = globalThis.SharedArrayBuffer || globalThis.ArrayBuffer;
        const numberOfChannels = audioData.length;
        const length = audioData?.[0].length;
        const resizeOptions: WaveformResizeOptions = { resizeFactor, minWidth };
        const resizes: ResizedWaveform[] = [];
        const sizes: number[] = [];
        const data: WaveformSliceData = {
            startIndex: 0,
            endIndex: length,
            resizedWaveforms: {
                resizes,
                sizes,
                resizeOptions
            },
        };
        const offsetFromFrame = 0;
        let prevW: number;
        let w: number;
        let prevMinData: Float32Array[];
        let prevMaxData: Float32Array[];
        let minData: Float32Array[];
        let maxData: Float32Array[];
        let $start: number;
        let $end: number;
        let subarray: number[];
        for (let samplesPerPixel = resizeFactor; length / samplesPerPixel >= minWidth; samplesPerPixel *= resizeFactor) {
            w = Math.ceil(length / samplesPerPixel);
            minData = [];
            maxData = [];
            for (let channel = 0; channel < numberOfChannels; channel++) {
                minData[channel] = new Float32Array(new SharedArrayBuffer(w * Float32Array.BYTES_PER_ELEMENT));
                maxData[channel] = new Float32Array(new SharedArrayBuffer(w * Float32Array.BYTES_PER_ELEMENT));
                for (let i = 0; i < w; i++) {
                    if (samplesPerPixel === resizeFactor) {
                        $start = i * resizeFactor;
                        $end = Math.min((i + 1) * resizeFactor, length);
                        subarray = audioData[channel].subarray($start, $end) as any;
                        minData[channel][i] = Math.min.apply(Math, subarray);
                        maxData[channel][i] = Math.max.apply(Math, subarray);
                    } else {
                        $start = i * resizeFactor;
                        $end = Math.min((i + 1) * resizeFactor, prevW!);
                        minData[channel][i] = Math.min.apply(Math, prevMinData![channel].subarray($start, $end) as any);
                        maxData[channel][i] = Math.max.apply(Math, prevMaxData![channel].subarray($start, $end) as any);
                    }
                }
            }
            sizes.push(w);
            resizes.push({ offsetFromFrame, samplesPerPixel, minData, maxData });
            prevW = w;
            prevMinData = minData;
            prevMaxData = maxData;
        }
        return data;
    }
}

export default WaveformProcessor;
