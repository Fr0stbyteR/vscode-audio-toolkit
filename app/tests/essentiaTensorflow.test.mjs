import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/modules/essentia/tensorflow.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false,
    plugins: [{ name: "stub-ui", setup(build) { build.onLoad({ filter: /Librosa(?:Vector|Matrix|Marker)Component\.tsx$/ }, () => ({ contents: "export default function Component() {}", loader: "js" })); } }] });
const { getTensorflowModules } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const modules = getTensorflowModules();
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);
const editor = { sampleRate: 48000, duration: 6, length: 288000, analyze: async () => { throw new Error("unexpected request"); } };
const find = algorithm => modules.find(Module => Module.MODULE_ID === `essentia.${algorithm}`);
async function calculate(algorithm, result) {
    const Module = find(algorithm), requests = [];
    const module = new Module({ ...editor, analyze: async request => { requests.push(request); return structuredClone(result); } }, { ...Module.DEFAULT_STATE });
    await module.calculate(); assert.equal(module.isCalculating, false); assert.equal(requests[0].engine, "essentia-tf");
    return { module, requests };
}
test("21 unique TF modules reuse all three existing visualization families", () => {
    assert.equal(modules.length, 21);
    assert.equal(new Set(modules.map(Module => Module.MODULE_ID)).size, 21);
    assert.equal(new Set(modules.map(Module => new Module(editor, { ...Module.DEFAULT_STATE }).Component)).size, 3);
    assert.equal(find("tfTempo").DEFAULT_ANALYSIS_STATE.hopSeconds, 6);
});
test("matrix scores keep class labels and native timeline spacing; display edits do not recalculate", async () => {
    const { module, requests } = await calculate("tfInstrument", { matrix: [[.1, .8], [.2, .9], [.3, .6]], labels: ["piano", "violin"], sampleRate: 16000, duration: 6, metadata: { hopLength: 32000, minValue: 0, maxValue: 1 } });
    assert.deepEqual(module.binLabels, ["piano", "violin"]); assert.equal(module.bins, 2);
    assert.deepEqual(module.valueRange, [0, 1]); assert.equal(module.valueUnit, "Score");
    module.setState({ ...module.state, colorMin: .3, colorMax: .8, opacity: .5 }); assert.equal(requests.length, 1);
});
test("selected label curves expose all classes and only analysis edits request new scores", async () => {
    const { module, requests } = await calculate("tfInstrumentCurve", { vectors: [[.2, .4, .3]], sampleRate: 16000, duration: 6, metadata: { hopLength: 32000, classLabels: JSON.stringify(["piano", "violin"]) } });
    assert.equal(module.dataSlices[0].audioSamplesPerSample, 96000);
    assert.deepEqual(module.getOptionsMetadata().label, ["Target label", "piano", "violin"]);
    module.setState({ ...module.state, color: "#112233" }); assert.equal(requests.length, 1);
    module.setState({ ...module.state, label: "violin" }); assert.equal(requests[1].options.label, "violin");
});
test("candidate regions are editable, integer-aligned and manually edited markers survive restoration", async () => {
    const { module, requests } = await calculate("tfInstrumentRegions", { intervals: [[.10001, 3.2]], labels: ["piano · candidate"], duration: 6, metadata: { classLabels: '["piano","violin"]' } });
    assert.deepEqual(module.state.data[0].position, [4800, 153600]);
    module.setMarkerName("Reviewed piano", 0); assert.equal(requests.length, 1);
    const restored = await find("tfInstrumentRegions").fromAudioData(editor, module.state);
    assert.equal(restored.state.data[0].name, "Reviewed piano");
    assert.deepEqual(restored.getOptionsMetadata().label, ["Target label", "piano", "violin"]);
});
