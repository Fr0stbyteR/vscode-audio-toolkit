// import { rms, zcr, setTypedArray, absMax } from "../../utils/buffer";
// import { mod } from "../../utils/math";
// import yinEstimate from "../../utils/yin";
import { AudioWorkletGlobalScope, TypedAudioParamDescriptor } from "./types";
import { IPeakAnalyserProcessor, IPeakAnalyserNode, PeakAnalyserParameters } from "./PeakAnalyserWorklet.types";
import AudioWorkletProxyProcessor from "./AudioWorkletProxyProcessor";
import { absMax, mod, setTypedArray } from "../utils";

const processorId = "__AudioToolkit_PeakAnalyser";
declare const globalThis: AudioWorkletGlobalScope & { SharedArrayBuffer: typeof SharedArrayBuffer | typeof ArrayBuffer; Atomics: typeof Atomics };
if (!globalThis.SharedArrayBuffer) globalThis.SharedArrayBuffer = ArrayBuffer;
const { registerProcessor, sampleRate } = globalThis;

/**
 * Some data to transfer across threads
 */
class TemporalAnalyserAtoms {
    private readonly _sab: SharedArrayBuffer;
    private readonly _$read: Uint32Array;
    private readonly _$write: Uint32Array;
    private readonly _$total: Uint32Array;
    /** Audio sample index reading in the window */
    get $read(): number {
        return this._$read[0];
    }
    set $read(value: number) {
        this._$read[0] = value;
    }
    /** Next audio sample index to write into the window */
    get $write(): number {
        return this._$write[0];
    }
    set $write(value: number) {
        this._$write[0] = value;
    }
    /** Total samples written counter */
    get $total(): number {
        return this._$total[0];
    }
    set $total(value: number) {
        this._$total[0] = value;
    }
    /** Get all atoms */
    get asObject() {
        return { $write: this._$write, $read: this._$read, $total: this._$total };
    }
    constructor() {
        this._sab = new SharedArrayBuffer(3 * Uint32Array.BYTES_PER_ELEMENT);
        this._$read = new Uint32Array(this._sab, 0, 1);
        this._$write = new Uint32Array(this._sab, 4, 1);
        this._$total = new Uint32Array(this._sab, 8, 1);
    }
}
class TemporalAnalyserProcessor extends AudioWorkletProxyProcessor<IPeakAnalyserProcessor, IPeakAnalyserNode, PeakAnalyserParameters> implements IPeakAnalyserProcessor {
    static get parameterDescriptors(): TypedAudioParamDescriptor<PeakAnalyserParameters>[] {
        return [{
            defaultValue: 1024,
            maxValue: 2 ** 32,
            minValue: 128,
            name: "windowSize"
        }];
    }
    private destroyed = false;
    private readonly atoms = new TemporalAnalyserAtoms();
    /** Concatenated audio data, array of channels */
    private readonly windowSab: SharedArrayBuffer[] = [];
    /** Float32Array Buffer view of window */
    private readonly window: Float32Array[] = [];
    /** Audio sample index reading in the window */
    private peakSinceLastGet: number[] = [];
    get $read() {
        return this.atoms.$read;
    }
    set $read(value: number) {
        this.atoms.$read = value;
    }
    /** Next audio sample index to write into the window */
    get $write() {
        return this.atoms.$write;
    }
    set $write(value: number) {
        this.atoms.$write = value;
    }
    /** Total samples written counter */
    get $total() {
        return this.atoms.$total;
    }
    set $total(value: number) {
        this.atoms.$total = value;
    }
    getPeak() {
        const peak = this.window.map(a => absMax(a, this.$read, this.windowSize));
        this.peakSinceLastGet = peak;
        return peak;
    }
    getPeakSinceLastGet() {
        const peak = this.peakSinceLastGet;
        this.getPeak();
        return peak;
    }
    destroy() {
        this.destroyed = true;
        this._disposed = true;
    }
    private _windowSize = 1024;
    get windowSize() {
        return this._windowSize;
    }
    set windowSize(sizeIn: number) {
        this._windowSize = ~~Math.min(2 ** 32, Math.max(128, sizeIn || 1024));
    }
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<PeakAnalyserParameters, Float32Array>) {
        if (this.destroyed) return false;
        const input = inputs[0];
        this.windowSize = ~~parameters.windowSize[0];
        const { windowSize } = this;

        if (this.window.length > input.length) { // Too much channels ?
            this.windowSab.splice(input.length);
            this.window.splice(input.length);
        }
        if (input.length === 0) return true;

        const bufferSize = Math.max(...input.map(c => c.length)) || 128;

        const dataSize = windowSize + sampleRate;
        this.$write %= dataSize;
        this.$total += bufferSize;
        let { $write } = this;
        // Init windows
        for (let i = 0; i < input.length; i++) {
            $write = this.$write;
            if (!this.window[i]) { // Initialise channel if not exist
                this.windowSab[i] = new SharedArrayBuffer(dataSize * Float32Array.BYTES_PER_ELEMENT);
                this.window[i] = new Float32Array(this.windowSab[i]);
            } else {
                if (this.window[i].length !== dataSize) { // adjust window size if not corresponded
                    const oldWindow = this.window[i];
                    const windowSab = new SharedArrayBuffer(dataSize * Float32Array.BYTES_PER_ELEMENT);
                    const window = new Float32Array(windowSab);
                    $write = setTypedArray(window, oldWindow, 0, $write - Math.min(dataSize, oldWindow.length));
                    this.windowSab[i] = windowSab;
                    this.window[i] = window;
                }
            }
        }
        this.$write = $write;
        // Write
        for (let i = 0; i < input.length; i++) {
            const window = this.window[i];
            const channel = input[i].length ? input[i] : new Float32Array(bufferSize);
            if (bufferSize > dataSize) {
                $write = setTypedArray(window, channel.subarray(bufferSize - dataSize), this.$write);
            } else {
                $write = setTypedArray(window, channel, this.$write);
            }
        }
        this.$write = $write;
        this.$read = mod($write - windowSize, dataSize);

        // write peaks
        input.map(array => absMax(array)).forEach((v, i) => {
            if (!this.peakSinceLastGet[i] || v > this.peakSinceLastGet[i]) this.peakSinceLastGet[i] = v;
        });
        return true;
    }
}
try {
    registerProcessor(processorId, TemporalAnalyserProcessor);
} catch (error) {
    // eslint-disable-next-line no-console
    console.warn(error);
}
