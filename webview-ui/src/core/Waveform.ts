import WaveformWorker from "../workers/WaveformWorker";
import OperableAudioBuffer from "./OperableAudioBuffer";

export interface WaveformMinMaxData {
    min: Float32Array;
    max: Float32Array;
}
export interface WaveformStepData extends Array<WaveformMinMaxData> {
    idx?: Int32Array;
}
export interface WaveformData {
    [step: number]: WaveformStepData;
}

class Waveform {
    static stepsFactor = 16;
    static async fromAudioBuffer(audioBuffer: OperableAudioBuffer) {
        const waveform = new Waveform(audioBuffer);
        await waveform.generate();
        return waveform;
    }
    [step: number]: WaveformStepData;
    worker = new WaveformWorker();
    get length() {
        return this.audioBuffer.length;
    }
    get steps() {
        return Object.keys(this).filter(v => +v).map(v => +v).sort((a, b) => a - b);
    }
    constructor(
        public audioBuffer: OperableAudioBuffer
    ) {}

    async generate() {
        const audioChannelData = this.audioBuffer.toArray(true);
        const data = await this.worker.generate(audioChannelData, Waveform.stepsFactor);
        for (const key in data) {
            this[key] = data[key];
        }
    }
    generateEmpty(numberOfChannels: number, l: number) {
        const { stepsFactor } = Waveform;
        for (let stepLength = stepsFactor; stepLength <= l / stepsFactor; stepLength *= stepsFactor) {
            const stepData: WaveformStepData = [];
            this[stepLength] = stepData;
            const stepsCount = Math.ceil(l / stepLength);
            const idxData = new Int32Array(stepsCount);
            for (let i = 0; i < idxData.length; i++) {
                idxData[i] = i * stepLength;
            }
            stepData.idx = idxData;
            for (let c = 0; c < numberOfChannels; c++) {
                const minData = new Float32Array(stepsCount);
                const maxData = new Float32Array(stepsCount);
                stepData[c] = { min: minData, max: maxData };
            }
        }
    }
    generateStep(stepLength: number) {
        const { stepsFactor } = Waveform;
        const { audioBuffer: buffer } = this;
        if (!this[stepLength]) this[stepLength] = [];
        const l = buffer.length;
        let maxInStep = 0;
        let minInStep = 0;
        if (stepLength === stepsFactor) { // recalculate from samples
            const stepsCount = Math.ceil(l / stepLength);
            const idxData = new Int32Array(stepsCount);
            for (let i = 0; i < idxData.length; i++) {
                idxData[i] = i * stepLength;
            }
            this[stepLength].idx = idxData;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
                const minData = new Float32Array(stepsCount);
                const maxData = new Float32Array(stepsCount);
                const channel = buffer.getChannelData(c);
                for (let i = 0; i < idxData.length; i++) {
                    const $0 = idxData[i];
                    const $1 = i === idxData.length - 1 ? l : idxData[i + 1];
                    for (let j = $0; j < $1; j++) {
                        const samp = channel[j];
                        if (j === $0) {
                            maxInStep = samp;
                            minInStep = samp;
                        } else {
                            if (samp > maxInStep) maxInStep = samp;
                            if (samp < minInStep) minInStep = samp;
                        }
                    }
                    minData[i] = minInStep;
                    maxData[i] = maxInStep;
                }
                this[stepLength][c] = { min: minData, max: maxData };
            }
        } else { // calculate from lower level
            const prevIdx = this[stepLength / stepsFactor].idx!;
            const stepsCount = Math.ceil(prevIdx.length / 16);
            const idxData = new Int32Array(stepsCount);
            for (let i = 0; i < idxData.length; i++) {
                idxData[i] = prevIdx[i * stepsFactor];
            }
            this[stepLength].idx = idxData;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
                const minData = new Float32Array(stepsCount);
                const maxData = new Float32Array(stepsCount);
                const { min: prevMin, max: prevMax } = this[stepLength / stepsFactor][c];
                for (let i = 0; i < idxData.length; i++) {
                    const $prev0 = i * stepsFactor;
                    const $prev1 = i === idxData.length - 1 ? prevIdx.length : ((i + 1) * stepsFactor);
                    for (let j = $prev0; j < $prev1; j++) {
                        const sampMax = prevMax[j];
                        const sampMin = prevMin[j];
                        if (j === $prev0) {
                            maxInStep = sampMax;
                            minInStep = sampMin;
                        } else {
                            if (sampMax > maxInStep) maxInStep = sampMax;
                            if (sampMin < minInStep) minInStep = sampMin;
                        }
                    }
                    minData[i] = minInStep;
                    maxData[i] = maxInStep;
                }
                this[stepLength][c] = { min: minData, max: maxData };
            }
        }
        return this[stepLength];
    }
    /**
     * Find an existing waveform with a precision (could be samples per pixel)
     * returning a waveform that is sufficient to the precision.
     * (step is the largest value smaller than the precision)
     */
    findStep(precision: number) {
        const key = this.steps.reduce<number>((acc, cur) => (cur < precision && cur > (acc || 0) ? cur : acc), 0);
        if (!key) return null;
        return this[key];
    }
}

export default Waveform;
