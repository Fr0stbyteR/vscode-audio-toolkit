import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/modules/essentia/index.ts", import.meta.url))],
    bundle: true, platform: "node", format: "esm", write: false,
    plugins: [{ name: "stub-ui-only", setup(build) {
        build.onLoad({ filter: /Librosa(?:Vector|Matrix|Marker)Component\.tsx$/ }, () => ({ contents: "export default function Component() {}", loader: "js" }));
    } }]
});
const { default: getModules } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const Modules = await getModules();
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);
const editor = { sampleRate: 48000, duration: 4, length: 192000, analyze: async () => { throw new Error("unexpected request"); } };
const find = name => Modules.find(Module => Module.MODULE_ID === `essentia.${name}`);
async function calculate(name, result) {
    const Module = find(name), requests = [];
    const module = new Module({ ...editor, analyze: async request => { requests.push(request); return structuredClone(result); } }, { ...Module.DEFAULT_STATE });
    await module.calculate();
    assert.equal(module.isCalculating, false);
    assert.equal(requests[0].engine, "essentia");
    assert.equal(requests[0].algorithm, name);
    return { module, requests };
}

test("native catalog has 29 unique registered modules and shared renderer families", () => {
    const native = Modules.filter(Module => Module.ANALYSIS_ENGINE === "essentia");
    assert.equal(native.length, 29);
    assert.equal(new Set(Modules.map(Module => Module.MODULE_ID)).size, Modules.length);
    assert.equal(new Set(Modules.map(Module => new Module(editor, { ...Module.DEFAULT_STATE }).Component)).size, 3);
    assert.ok(native.every(Module => Module.ANALYSIS_ENGINE === "essentia"));
});
test("native vectors use the existing Vector processor with correct audio timeline stride", async () => {
    const { module, requests } = await calculate("rms", { vectors: [[.1, .2, .3]], sampleRate: 44100, duration: 3.99, metadata: { hopLength: 512 } });
    const slice = module.dataSlices[0];
    assert.ok(slice.vectors[0] instanceof Float32Array);
    assert.equal(slice.endIndex, 192000);
    assert.equal(slice.audioSamplesPerSample, 512 / 44100 * 48000 * 4 / 3.99);
    assert.ok(slice.resizedVectors);
    module.setState({ ...module.state, color: "#abc" });
    assert.equal(requests.length, 1, "appearance must not cause native reanalysis");
});
test("HPCP uses shared Matrix resizing and A-first pitch-class labels; MFCC has signed range", async () => {
    const { module } = await calculate("hpcp", { matrix: [Array(12).fill(.2), Array(12).fill(.4)], sampleRate: 44100, duration: 4, metadata: { hopLength: 512, minValue: 0, maxValue: 1 } });
    assert.equal(module.bins, 12);
    assert.equal(module.binLabels[0], "A");
    assert.equal(module.binLabels[3], "C");
    assert.equal(module.valueUnit, "Strength");
    assert.ok(module.dataSlices[0].resizedMatrices.resizes.length);
    const mfcc = (await calculate("mfcc", { matrix: [[-80, 20], [-60, 10]], sampleRate: 44100, duration: 4, metadata: { hopLength: 512, minValue: -80, maxValue: 20 } })).module;
    assert.deepEqual(mfcc.valueRange, [-80, 20]);
    assert.equal(mfcc.valueUnit, "MFCC");
});
test("native markers reuse editing methods, labels, integer indices and persisted manual changes", async () => {
    const { module, requests } = await calculate("pitchNotes", { intervals: [[.1234, 1.5]], labels: ["A4"], duration: 4 });
    assert.deepEqual(module.state.data[0].position, [5923, 72000]);
    module.setMarkerName("Adjusted A4", 0);
    module.setMarkerPosition(0, [1000, 2000]);
    assert.equal(requests.length, 1);
    const restored = await find("pitchNotes").fromAudioData(editor, module.state);
    assert.deepEqual(restored.state.data[0].position, [1000, 2000]);
    assert.equal(restored.state.data[0].name, "Adjusted A4");
    const onset = (await calculate("onsets", { values: [1.00001], duration: 4 })).module;
    assert.equal(onset.state.data[0].position, 48000);
});
