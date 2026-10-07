import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function bundled(path, stubUI = false) {
    const bundle = await build({
        entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
        bundle: true, platform: "node", format: "esm", write: false,
        plugins: stubUI ? [{ name: "stub-ui", setup(build) {
            build.onLoad({ filter: /(?:Librosa(?:Vector|Matrix|Marker)|MusicCurve)Component\.tsx$/ }, () => ({ contents: "export default function Component() {}", loader: "js" }));
        } }] : []
    });
    return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
}
const { analysisIdentity, cachedAnalysisForModule, cachedModuleForModule, cachedModulesToAdd, mergeCachedAnalyses, rememberCachedModuleState } = await bundled("../src/core/AnalysisCache.ts");
const definition = (algorithm, engine = "librosa") => ({ getAnalysisRequest: () => ({ engine, algorithm, options: { hopLength: 512 } }) });
const cache = (algorithm, hopLength, engine = "librosa", savedAt = "2026-10-02") => ({ request: { engine, algorithm, options: { hopLength } }, savedAt });

test("cache identity ignores option ordering and refresh policy, but separates engines and parameters", () => {
    assert.equal(analysisIdentity({ algorithm: "rms", options: { b: 1, a: 2 } }), analysisIdentity({ engine: "librosa", algorithm: "rms", options: { a: 2, b: 1 }, cachePolicy: "refresh" }));
    assert.notEqual(analysisIdentity(cache("rms", 512).request), analysisIdentity(cache("rms", 256).request));
    assert.notEqual(analysisIdentity(cache("rms", 512).request), analysisIdentity(cache("rms", 512, "essentia").request));
});

test("menu prefers defaults, otherwise restores the newest compatible saved settings", () => {
    const defaults = cache("rms", 512), latest = cache("rms", 256, "librosa", "2026-10-03");
    assert.equal(cachedAnalysisForModule(definition("rms"), [latest, defaults]), defaults);
    assert.equal(cachedAnalysisForModule(definition("rms"), [cache("rms", 128), latest]), latest);
    assert.equal(cachedAnalysisForModule({}, [latest]), undefined);
    assert.equal(cachedAnalysisForModule(definition("rms"), [{ ...latest, request: { ...latest.request, options: {} } }]), undefined);
    assert.equal(cachedAnalysisForModule(definition("rms"), [{ ...latest, request: { ...latest.request, options: { hopLength: 256, obsolete: true } } }]), undefined);
});

test("bulk add skips existing and hidden modules and adds only one variant per registered module", () => {
    const modules = { rms: definition("rms"), mfcc: definition("mfcc"), native: definition("rms", "essentia"), waveform: {} };
    const entries = [cache("rms", 512), cache("mfcc", 128), cache("mfcc", 256, "librosa", "2026-10-01"), cache("rms", 512, "essentia"), cache("unknown", 512)];
    assert.deepEqual(cachedModulesToAdd(modules, entries, [{ moduleId: "rms", state: { hidden: true } }]), [
        { moduleId: "mfcc", state: { hopLength: 128 } }, { moduleId: "native", state: { hopLength: 512 } }
    ]);
    assert.equal(mergeCachedAnalyses(entries, [cache("rms", 512, "librosa", "2026-10-04")]).length, entries.length);
    assert.equal(mergeCachedAnalyses(entries, [cache("rms", 512, "librosa", "2026-10-04")])[0].savedAt, "2026-10-04");
});

test("all librosa and Essentia module descriptors match their calculation defaults without starting jobs", async () => {
    const catalogs = await Promise.all([bundled("../src/modules/librosa/index.ts", true), bundled("../src/modules/essentia/index.ts", true)]);
    const modules = (await Promise.all(catalogs.map(catalog => catalog.default()))).flat();
    assert.equal(modules.filter(Module => Module.ANALYSIS_ENGINE === "librosa").length, 38);
    for (const Module of modules) {
        const request = Module.getAnalysisRequest();
        assert.equal(request.engine, Module.ANALYSIS_ENGINE);
        assert.ok(request.algorithm);
        assert.deepEqual(request.options, Module.DEFAULT_ANALYSIS_STATE);
        const entry = { request, savedAt: "2026-10-02" };
        assert.equal(cachedAnalysisForModule(Module, [entry]), entry);
    }
});

test("VA results and manual edits are advertised and restored without native analysis requests", async () => {
    const { MoodVA } = await bundled("../src/modules/music-features/MusicCurve.ts", true);
    const registry = { "music.va": MoodVA, rms: definition("rms") };
    const state = { ...MoodVA.DEFAULT_STATE, points: [{ time: 1, values: [.25, -.4] }], source: "Manual" };
    let snapshots = rememberCachedModuleState([], "music.va", MoodVA, state);
    state.points[0].values[0] = .9;
    const cached = cachedModuleForModule("music.va", MoodVA, [], snapshots);
    assert.equal(cached.state.points[0].values[0], .25, "cache does not alias editable module state");
    assert.deepEqual(cachedModulesToAdd(registry, [], [], snapshots), [{ moduleId: "music.va", state: cached.state }]);
    assert.deepEqual(cachedModulesToAdd(registry, [], [{ moduleId: "music.va", visible: false }], snapshots), []);
    const module = await MoodVA.fromAudioData({ duration: 5 }, cached.state);
    assert.deepEqual(module.getState().points, snapshots[0].state.points);
    assert.equal(module.getState().source, "Manual");
    snapshots = rememberCachedModuleState(snapshots, "music.va", MoodVA, { ...state, points: [] });
    assert.equal(cachedModuleForModule("music.va", MoodVA, [], snapshots), undefined, "clearing all points invalidates the curve cache");
    for (const points of [[{ time: 0, values: [null, null] }], [{ time: 0, values: [1] }], [{ time: Infinity, values: [0, 0] }]]) {
        assert.equal(MoodVA.getCacheableState({ ...state, points }), undefined);
    }
    assert.equal(cachedModuleForModule("rms", registry.rms, [cache("rms", 512)], snapshots).state.hopLength, 512);
});

test("VA calculation updates the menu snapshot; disposing ignores late results", async () => {
    const { MoodVA } = await bundled("../src/modules/music-features/MusicCurve.ts", true);
    let resolve;
    const editor = { duration: 5, metadata: { values: {}, sources: {} },
        analyzeMood: () => new Promise(done => { resolve = done; }),
        setMetadata(metadata) { this.metadata = metadata; }
    };
    const module = await MoodVA.fromAudioData(editor);
    let snapshots = [];
    module.onStateChange = state => { snapshots = rememberCachedModuleState(snapshots, "music.va", MoodVA, state); };
    const calculation = module.calculate();
    assert.equal(snapshots.length, 0, "creating/loading an empty VA is not cached");
    const metadata = { "statistics.version": 1, "statistics.0.mean": .2, "statistics.1.mean": -.3 };
    resolve({ model: "test-va", metadata, points: [{ timeSeconds: 1, valence: .2, arousal: -.3 }] });
    await calculation;
    assert.equal(cachedModuleForModule("music.va", MoodVA, [], snapshots).state.source, "test-va");
    assert.deepEqual(cachedModuleForModule("music.va", MoodVA, [], snapshots).state.analysisMetadata, metadata);
    module.setState({ ...module.getState(), opacity: .5 });
    assert.deepEqual(module.getState().analysisMetadata, metadata, "appearance does not invalidate server stats");
    const restored = await MoodVA.fromAudioData(editor, cachedModuleForModule("music.va", MoodVA, [], snapshots).state);
    assert.deepEqual(restored.getState().analysisMetadata, metadata, "server summaries survive workspace restore");
    restored.setState({ ...restored.getState(), points: [{ time: 1, values: [.8, .3] }] });
    assert.equal(restored.getState().analysisMetadata, undefined, "editing values invalidates server summaries");
    const reused = module.calculate(false);
    resolve({ model: "test-va", metadata, points: [{ timeSeconds: 1, valence: .2, arousal: -.3 }] });
    await reused;
    assert.deepEqual(module.getState().analysisMetadata, metadata, "a reused cached response retains its matching summary");
    const late = module.calculate(); module.dispose();
    resolve({ model: "late", points: [{ timeSeconds: 1, valence: .9, arousal: .9 }] });
    await late;
    assert.equal(module.getState().source, "test-va");
});
