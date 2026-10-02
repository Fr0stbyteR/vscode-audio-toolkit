import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

// Exercise the real editor/module lifecycle, replacing only audio playback and UI.
const bundle = await build({
    stdin: { contents: 'export { default as AudioEditor } from "./src/core/AudioEditor"; export * from "./src/modules/music-features/MusicCurve"; export * from "./src/modules/music-features/MetadataMarker";', resolveDir: process.cwd() },
    bundle: true, platform: "browser", format: "esm", write: false,
    external: ["verovio/wasm", "verovio/esm"],
    alias: { "@shren/typed-event-emitter": "@shren/typed-event-emitter/dist/esm/index.js" },
    plugins: [{ name: "browser-surfaces", setup(build) {
        build.onLoad({ filter: /(?:AudioPlayer|OperableAudioBuffer)\.ts$/ }, () => ({ contents: "export default class Stub {}", loader: "js" }));
        build.onLoad({ filter: /(?:Spectrogram|Waveform)\.ts$/ }, () => ({ contents: 'export default class Stub { static MODULE_ID = "stub"; static DEFAULT_STATE = {}; }', loader: "js" }));
        build.onLoad({ filter: /MetadataMarker\.tsx$/ }, async args => ({ contents: (await readFile(args.path, "utf8")).split("const MetadataMarkerComponent:")[0] + "const MetadataMarkerComponent = () => null;", loader: "tsx" }));
        build.onLoad({ filter: /(?:MusicCurve|Marker)Component\.tsx$/ }, () => ({ contents: "export default function Component() {}", loader: "js" }));
    } }]
});
const { AudioEditor, MoodVA, MusicCurve, PerformedTempo, MetadataMarker, KeyRegions, MeterRegions } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`).catch(error => { throw new Error(error.message); });
const modules = [MusicCurve, PerformedTempo, MoodVA, MetadataMarker, KeyRegions, MeterRegions];
AudioEditor.MODULES_MAP = Object.fromEntries(modules.map(Module => [Module.MODULE_ID, Module]));
const makeEditor = (uri = "audio-a") => new AudioEditor({ duration: 5, length: 220500, sampleRate: 44100, numberOfChannels: 1 }, [], {}, {}, uri, "workspace");

test("metadata-style add, menu cache events, delete/re-add and reopen share one VA snapshot", async () => {
    const editor = makeEditor();
    let updates = 0;
    editor.on("moduleCache", () => { updates++; });
    const va = await editor.addModule("music.va"); // Same call as the metadata panel.
    assert.equal(editor.cachedModuleStates.length, 0);
    va.editPoints([{ time: 1, values: [.25, -.4] }]);
    assert.equal(editor.cachedModuleStates[0].state.source, "Manual");
    assert.deepEqual(editor.cachedModuleStatesForDocument, [], "active curves are not duplicated in localStorage");
    assert.ok(updates >= 2, "menu receives a live cache update after editing");
    editor.removeModule(0);
    assert.equal(editor.cachedModuleStates.length, 1, "deleting a layer keeps its cached data");
    assert.equal(editor.cachedModuleStatesForDocument.length, 1);
    const snapshot = JSON.parse(JSON.stringify(editor.cachedModuleStates)); // Browser workspace document.
    const restored = await editor.addModule("music.va");
    assert.deepEqual(restored.getState().points, [{ time: 1, values: [.25, -.4] }]);
    const reopened = makeEditor();
    reopened.restoreCachedModuleStates(snapshot);
    assert.deepEqual((await reopened.addModule("music.va")).getState().points, restored.getState().points);
    const otherAudio = makeEditor("audio-b");
    assert.equal((await otherAudio.addModule("music.va")).getState().points.length, 0, "other audio does not inherit VA results");
    restored.editPoints([]);
    assert.equal(editor.cachedModuleStates.length, 0);
    editor.removeModule(0);
    assert.equal((await editor.addModule("music.va")).getState().points.length, 0);
});

test("old documents migrate VA points, explicit imported state overrides cache, reset starts empty", async () => {
    const editor = makeEditor();
    const initial = { ...MoodVA.DEFAULT_STATE, points: [{ time: 2, values: [.5, .1] }], source: "Model" };
    await editor.addModule("music.va", initial);
    editor.restoreCachedModuleStates();
    assert.deepEqual(editor.cachedModuleStates[0].state.points, initial.points);
    const explicit = await editor.addModule("music.va", { ...MoodVA.DEFAULT_STATE, points: [] });
    assert.equal(explicit.getState().points.length, 0, "empty imported state must not revive an older curve");
    assert.equal(editor.cachedModuleStates.length, 0);
    const fresh = makeEditor();
    fresh.restoreCachedModuleStates([]);
    assert.equal(fresh.cachedModuleStates.length, 0);
});

test("all six metadata modules cache only actual data, retaining edits/settings across deletion and reload", async () => {
    for (const Module of modules) {
        const editor = makeEditor();
        const empty = await editor.addModule(Module.MODULE_ID);
        assert.equal(editor.cachedModuleStates.length, 0, Module.MODULE_ID);
        const curve = Module.DEFAULT_STATE.kind;
        const state = curve ? { ...empty.getState(), points: [{ time: 1, values: curve === "va" ? [.2, -.4] : [90] }], source: "Manual", windowSeconds: 8 }
            : { ...empty.getState(), data: [{ position: [44100, 88200], name: "Edited", color: "#c586c0" }], minimumMeasures: 8, candidates: [{ name: "Pending" }] };
        empty.setState(state);
        assert.equal(editor.cachedModuleStates.length, 1, Module.MODULE_ID);
        assert.equal(editor.cachedModuleStates[0].state.candidates, undefined);
        editor.removeModule(0);
        const restored = await editor.addModule(Module.MODULE_ID);
        assert.deepEqual(restored.getState()[curve ? "points" : "data"], state[curve ? "points" : "data"], Module.MODULE_ID);
        assert.equal(restored.getState()[curve ? "windowSeconds" : "minimumMeasures"], 8);
        editor.removeModule(0);
        const reopened = makeEditor();
        reopened.restoreCachedModuleStates(JSON.parse(JSON.stringify(editor.cachedModuleStatesForDocument)));
        const reloaded = await reopened.addModule(Module.MODULE_ID);
        reloaded.syncMetadata?.();
        assert.deepEqual(reloaded.getState()[curve ? "points" : "data"], state[curve ? "points" : "data"]);
        reloaded.setState({ ...reloaded.getState(), [curve ? "points" : "data"]: [] });
        assert.equal(reopened.cachedModuleStates.length, 0, "cleared data is not advertised");
    }
});

test("metadata synchronization never revives a deliberately cleared tempo or region field", async () => {
    for (const Module of [MusicCurve, MetadataMarker, KeyRegions, MeterRegions]) {
        const editor = makeEditor(), field = Module.DEFAULT_STATE.field ?? "tempo";
        const state = field === "tempo" ? { ...Module.DEFAULT_STATE, points: [{ time: 1, values: [90] }] }
            : { ...Module.DEFAULT_STATE, data: [{ position: [44100, 88200], name: "A", color: "#4e94ce" }] };
        const module = await editor.addModule(Module.MODULE_ID, state);
        module.syncMetadata();
        assert.equal(editor.metadata.values[field].length, 1, "old document data populates untouched metadata");
        editor.setMetadata({ ...editor.metadata, values: { ...editor.metadata.values, [field]: [] }, sources: { ...editor.metadata.sources, [field]: "user" } });
        module.syncMetadata();
        assert.equal(module.getState()[field === "tempo" ? "points" : "data"].length, 0);
        assert.equal(editor.cachedModuleStates.length, 0);
    }
});

test("cached performed tempo does not recompute on display unless its DTW inputs change", async () => {
    const editor = makeEditor();
    const score = { scoreKey: "score", alignmentAudioKey: editor.uri, autoAlignment: [{ scoreTime: 0, audioTime: 0 }, { scoreTime: 1, audioTime: 1 }, { scoreTime: 2, audioTime: 2 }], manualAnchors: [] };
    editor.modulesInstance.push({ moduleId: "score.musicxml", getState: () => score });
    const signature = JSON.stringify([score.scoreKey, score.alignmentAudioKey, score.autoAlignment, score.manualAnchors, 3, .5]);
    const tempo = await PerformedTempo.fromAudioData(editor, { points: [{ time: 1, values: [90] }], source: "DTW estimate", alignmentSignature: signature });
    await tempo.calculate(false);
    assert.equal(tempo.getState().error, "", "unchanged cached curve must not attempt loading/reanalyzing the score");
    assert.equal(tempo.busy, false);
    score.manualAnchors.push({ scoreTime: 1, audioTime: 1.1 });
    await tempo.calculate(false);
    assert.notEqual(tempo.getState().error, "", "changed DTW inputs trigger a calculation (no IndexedDB score in this fixture)");
    const detached = await PerformedTempo.fromAudioData(makeEditor(), { points: [{ time: 1, values: [90] }] });
    await detached.calculate(false);
    assert.equal(detached.getState().error, "", "cached results remain viewable without a score layer");
});
