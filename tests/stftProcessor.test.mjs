import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import windowFunctions from "window-function";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/core/STFTProcessor.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const { default: STFT, allocateFrames } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("real in-place FFTW agrees with DFT, including leading/trailing partial windows", async () => {
    const entry = fileURLToPath(new URL("../node_modules/@shren/fftw-js/dist/esm-bundle/index.js", import.meta.url));
    const native = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", write: false });
    const module = { exports: {} };
    new Function("require", "__dirname", "module", "exports", native.outputFiles[0].text)(createRequire(import.meta.url), dirname(entry), module, module.exports);
    const wasm = await module.exports.instantiateFFTWModule();
    const FFT = new module.exports.FFTW(wasm).r2r.FFT1D;
    const options = { fftSize: 16, fftOverlap: 4, fftWindowFunction: "blackmanHarris", contextPadding: true, includePhase: false };
    for (const length of [1, 7, 33, 100]) {
        const input = Float32Array.from({ length }, (_, i) => Math.sin(i * .25) + .1);
        const actual = STFT.stft(FFT, input, options).magnitudes, expected = reference(input, options);
        for (let frame = 0; frame < actual.length; frame++) for (let bin = 0; bin < actual[frame].length; bin++) {
            assert.ok(Math.abs(actual[frame][bin] - expected[frame][bin]) < 1e-6);
        }
    }
});

// Independent DFT with FFTW's R2HC layout. Reuse dirty input/output buffers to
// catch partial-window zero-fill bugs and returning freed WASM views.
class DFT {
    static disposed = 0;
    constructor(size) { this.input = new Float32Array(size).fill(999); this.output = new Float32Array(size); }
    forward(input) {
        if (typeof input === "function") input(this.input); else this.input.set(input);
        const n = this.input.length;
        for (let k = 0; k <= n / 2; k++) {
            let real = 0, imag = 0;
            for (let j = 0; j < n; j++) { const angle = 2 * Math.PI * k * j / n; real += this.input[j] * Math.cos(angle); imag -= this.input[j] * Math.sin(angle); }
            this.output[k] = real;
            if (k > 0 && k < n / 2) this.output[n - k] = imag;
        }
        return this.output;
    }
    inverse(input) { this.output.set(input); return this.output; }
    dispose() { DFT.disposed++; this.output.fill(NaN); }
}

function reference(array, options) {
    const { fftSize: n, fftOverlap: overlap, fftWindowFunction: name, contextPadding, startIndex = 0, endIndex = array.length } = options;
    const hop = Math.floor(n / overlap), padding = contextPadding ? hop * (overlap - 1) : 0;
    const frames = Math.ceil((endIndex - startIndex + 2 * padding) / hop);
    const energy = { rectangular: 1, hann: 2, blackmanHarris: 2.7874989727382036 }[name];
    return Array.from({ length: frames }, (_, frame) => {
        const start = startIndex + hop - n - padding + frame * hop;
        const input = Float32Array.from({ length: n }, (_, i) => (array[start + i] ?? 0) * windowFunctions[name](i, n));
        const fft = new DFT(n), output = fft.forward(input);
        return Float32Array.from({ length: n / 2 + 1 }, (_, k) => Math.hypot(output[k], k === 0 || k === n / 2 ? 0 : output[n - k]) / n * energy);
    });
}

test("STFT matches independent DFT for short clips, partial frames, windows and context ranges", () => {
    for (const length of [1, 3, 16, 29]) for (const overlap of [1, 2, 4]) for (const window of ["rectangular", "hann", "blackmanHarris"]) {
        const array = Float32Array.from({ length }, (_, i) => Math.sin(i * .8) + .1);
        for (const range of [{}, { startIndex: Math.min(1, length), endIndex: length }]) {
            const options = { fftSize: 16, fftOverlap: overlap, fftWindowFunction: window, contextPadding: true, ...range };
            const actual = STFT.stft(DFT, array, options), expected = reference(array, options);
            assert.equal(actual.magnitudes.length, expected.length);
            for (let frame = 0; frame < expected.length; frame++) for (let bin = 0; bin < expected[frame].length; bin++) {
                assert.ok(Math.abs(actual.magnitudes[frame][bin] - expected[frame][bin]) < 1e-6, `${length}/${overlap}/${window}/${frame}/${bin}`);
            }
        }
    }
});

test("spectrogram can skip phases without changing magnitude/timing; rows use one output bank", () => {
    const array = Float32Array.from({ length: 33 }, (_, i) => Math.cos(i));
    const options = { fftSize: 16, fftOverlap: 4, fftWindowFunction: "hann", contextPadding: true };
    const withPhase = STFT.stft(DFT, array, options), withoutPhase = STFT.stft(DFT, array, { ...options, includePhase: false });
    assert.deepEqual(withPhase.magnitudes, withoutPhase.magnitudes);
    assert.deepEqual(withoutPhase.phases, []);
    assert.equal(new Set(withoutPhase.magnitudes.map(row => row.buffer)).size, 1);
    assert.notEqual(withPhase.magnitudes[0].buffer, withPhase.phases[0].buffer);
    assert.equal(withoutPhase.magnitudes[1].byteOffset, withoutPhase.magnitudes[0].byteLength);
});

test("ArrayBuffer fallback allocates owned contiguous banks when SharedArrayBuffer is unavailable", () => {
    const saved = globalThis.SharedArrayBuffer;
    try {
        globalThis.SharedArrayBuffer = undefined;
        const rows = allocateFrames(3, 9);
        assert.ok(rows[0].buffer instanceof ArrayBuffer);
        assert.equal(new Set(rows.map(row => row.buffer)).size, 1);
        rows[0][0] = 2;
        assert.equal(rows[1][0], 0);
    } finally { globalThis.SharedArrayBuffer = saved; }
});

test("forward/inverse own their results after FFT disposal; exceptions release plans", () => {
    const input = new Float32Array([1, 2, 3, 4]);
    assert.ok(STFT.forward(DFT, input).every(Number.isFinite));
    assert.deepEqual(STFT.inverse(DFT, input), input);
    const before = DFT.disposed;
    class Failure extends DFT { forward() { throw new Error("FFT failed"); } }
    assert.throws(() => STFT.stft(Failure, input, { fftSize: 4, fftOverlap: 2, fftWindowFunction: "hann" }), /FFT failed/);
    assert.equal(DFT.disposed, before + 1);
});

test("invalid window size, overlap and sample range cannot create unbounded frames", () => {
    const defaults = { fftSize: 16, fftOverlap: 2, fftWindowFunction: "hann" };
    for (const options of [{ fftSize: Infinity }, { fftSize: 3 }, { fftOverlap: 0 }, { fftOverlap: 17 }, { startIndex: -1 }, { endIndex: 100 }, { startIndex: 3, endIndex: 2 }]) {
        assert.throws(() => STFT.stft(DFT, new Float32Array(10), { ...defaults, ...options }), /Invalid/);
    }
});
