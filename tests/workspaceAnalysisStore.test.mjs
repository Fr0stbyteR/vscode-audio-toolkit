import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/standalone/WorkspaceAnalysisStore.ts", import.meta.url))],
    bundle: true, platform: "node", format: "esm", write: false,
    external: ["verovio/wasm", "verovio/esm"]
});
const { default: WorkspaceAnalysisStore } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

class MemoryFileHandle {
    kind = "file";
    content = new Blob();
    async getFile() { return this.content; }
    async createWritable() {
        let pending = this.content;
        return {
            write: async value => { pending = new Blob([value]); },
            close: async () => { this.content = pending; },
            abort: async () => {}
        };
    }
}

class MemoryDirectoryHandle {
    kind = "directory";
    directories = new Map();
    files = new Map();
    async *entries() { yield* this.files; yield* this.directories; }
    async removeEntry(name) {
        if (!this.directories.delete(name) && !this.files.delete(name)) throw new DOMException("Missing entry", "NotFoundError");
    }
    async queryPermission() { return "granted"; }
    async requestPermission() { return "granted"; }
    async getDirectoryHandle(name, { create = false } = {}) {
        if (!this.directories.has(name) && create) this.directories.set(name, new MemoryDirectoryHandle());
        if (!this.directories.has(name)) throw new DOMException("Missing directory", "NotFoundError");
        return this.directories.get(name);
    }
    async getFileHandle(name, { create = false } = {}) {
        if (!this.files.has(name) && create) this.files.set(name, new MemoryFileHandle());
        if (!this.files.has(name)) throw new DOMException("Missing file", "NotFoundError");
        return this.files.get(name);
    }
}

test("menu lists complete local results across engines without loading numeric payloads", async () => {
    const root = new MemoryDirectoryHandle(), hash = "f".repeat(64);
    const store = new WorkspaceAnalysisStore(root, hash, "test.wav");
    await store.enableWriting();
    for (const request of [{ algorithm: "rms", options: { hopLength: 256 } }, { algorithm: "rms", options: { hopLength: 512 } }, { engine: "essentia", algorithm: "rms", options: { frameSize: 2048 } }]) {
        await store.saveLibrosa(request, { algorithm: "rms", sampleRate: 44100, duration: 1, vectors: [[.1, .2]] });
    }
    const results = await (await (await (await root.getDirectoryHandle(".audio_toolkit")).getDirectoryHandle("assets")).getDirectoryHandle(hash)).getDirectoryHandle("results");
    for (const [name, handle] of results.files) if (name.endsWith(".f32")) {
        handle.content.arrayBuffer = () => { throw new Error("Menu must not load array data"); };
    }
    assert.deepEqual((await store.listAnalyses()).map(entry => entry.request.options.hopLength ?? entry.request.engine), [256, 512, "essentia"]);
    const binary = [...results.files.keys()].find(name => name.endsWith(".f32"));
    results.files.get(binary).content = new Blob([new Uint8Array(1)]);
    const warn = console.warn; console.warn = () => {};
    try { assert.equal((await store.listAnalyses()).length, 2, "truncated results must not be advertised"); }
    finally { console.warn = warn; }
    await store.resetLocal();
    assert.deepEqual(await store.listAnalyses(), []);
});

test("reset deletes only this audio's local asset and suppresses pending/late writes", async () => {
    const root = new MemoryDirectoryHandle(), hash = "a".repeat(64), other = "b".repeat(64);
    const store = new WorkspaceAnalysisStore(root, hash, "track.wav");
    const otherStore = new WorkspaceAnalysisStore(root, other, "other.wav");
    await store.enableWriting(); await otherStore.enableWriting();
    const request = { algorithm: "rms", options: {} }, result = { algorithm: "rms", vectors: [[1, 2]] };
    await store.saveLibrosa(request, result); await otherStore.saveLibrosa(request, result);
    store.scheduleDocument([{ moduleId: "marker", state: { data: [1] } }], () => {});
    const original = await root.getFileHandle("track.wav", { create: true });
    await store.resetLocal();
    assert.equal(store.canWrite, false);
    assert.equal(await store.loadLibrosa(request), undefined);
    await store.saveLibrosa(request, result);
    store.scheduleDocument([{ moduleId: "marker", state: {} }], () => {});
    await store.flushDocument();
    const assets = await (await root.getDirectoryHandle(".audio_toolkit")).getDirectoryHandle("assets");
    assert.equal(assets.directories.has(hash), false);
    assert.equal(assets.directories.has(other), true);
    assert.equal(await root.getFileHandle("track.wav"), original);
    assert.deepEqual([...(await otherStore.loadLibrosa(request)).vectors[0]], [1, 2]);
    assert.equal(await store.inspectWritePermission(), false);
    await assert.rejects(store.enableWriting(), /reset/);
    // A fresh store can save default layout without reviving the old instance.
    const fresh = new WorkspaceAnalysisStore(root, hash, "track.wav");
    await fresh.enableWriting(); fresh.scheduleDocument([], () => {}); await fresh.flushDocument();
    assert.deepEqual((await fresh.loadDocument()).modulesState, []);
});

test("denying reset folder permission retains local results and the active document", async () => {
    const root = new MemoryDirectoryHandle(), hash = "c".repeat(64);
    const store = new WorkspaceAnalysisStore(root, hash, "track.wav");
    await store.enableWriting(); store.scheduleDocument([], () => {}); await store.flushDocument();
    root.queryPermission = root.requestPermission = async () => "denied";
    await assert.rejects(store.resetLocal(), /permission/);
    assert.ok(await store.loadDocument());
    assert.equal(store.canWrite, true);
});

test("reset refuses unsafe cache identities and is idempotent for absent caches", async () => {
    const root = new MemoryDirectoryHandle();
    await assert.rejects(new WorkspaceAnalysisStore(root, "../other", "track.wav").resetLocal(), /identity/);
    assert.equal(root.directories.size, 0);
    const store = new WorkspaceAnalysisStore(root, "d".repeat(64), "track.wav");
    await store.resetLocal(); await store.resetLocal();
    assert.equal(root.directories.size, 0);
});

test("reset waits for an in-flight file write, then removes its completed data", async () => {
    const root = new MemoryDirectoryHandle(), hash = "e".repeat(64);
    const store = new WorkspaceAnalysisStore(root, hash, "track.wav");
    await store.enableWriting();
    const asset = await (await (await root.getDirectoryHandle(".audio_toolkit")).getDirectoryHandle("assets")).getDirectoryHandle(hash);
    const handle = await asset.getFileHandle("document.json", { create: true });
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    handle.createWritable = async () => ({ write: async () => { entered(); await new Promise(resolve => { release = resolve; }); }, close: async () => {}, abort: async () => {} });
    store.scheduleDocument([], () => {});
    const write = store.flushDocument(); await started;
    const reset = store.resetLocal();
    release(); await write; await reset;
    const assets = await (await root.getDirectoryHandle(".audio_toolkit")).getDirectoryHandle("assets");
    assert.equal(assets.directories.has(hash), false);
});

test("Essentia and librosa results do not share cache keys; native labels round-trip", async () => {
    const store = new WorkspaceAnalysisStore(new MemoryDirectoryHandle(), "native-audio", "tone.wav");
    await store.enableWriting();
    const request = { algorithm: "rms", options: { hopLength: 512 } };
    await store.saveLibrosa(request, { algorithm: "rms", sampleRate: 44100, duration: 1, vectors: [[1, 2]] });
    await store.saveLibrosa({ ...request, engine: "essentia" }, { algorithm: "rms", sampleRate: 44100, duration: 1, vectors: [[3, 4]] });
    assert.deepEqual([...(await store.loadLibrosa(request)).vectors[0]], [1, 2]);
    assert.deepEqual([...(await store.loadLibrosa({ ...request, engine: "essentia" })).vectors[0]], [3, 4]);
    const markerRequest = { engine: "essentia", algorithm: "keyRegions", options: { keyWindow: 8 } };
    await store.saveLibrosa(markerRequest, { algorithm: "keyRegions", sampleRate: 44100, duration: 5, intervals: [[1, 5]], labels: ["C major"] });
    const restored = await store.loadLibrosa(markerRequest);
    assert.deepEqual(restored.intervals, [[1, 5]]);
    assert.deepEqual(restored.labels, ["C major"]);
});

test("TensorFlow scores, class labels and edited regions survive workspace reopening", async () => {
    const root = new MemoryDirectoryHandle();
    const store = new WorkspaceAnalysisStore(root, "tf-audio", "track.wav");
    await store.enableWriting();
    const request = { engine: "essentia-tf", algorithm: "tfInstrument", options: { hopSeconds: 2 } };
    const result = { algorithm: "tfInstrument", sampleRate: 16000, duration: 4,
        matrix: [[.25, .75], [.5, .125]], labels: ["piano", "violin"],
        metadata: { hopLength: 32000, classLabels: '["piano","violin"]', model: "mtg_jamendo_instrument", timeAnchor: "cell-center" } };
    await store.saveLibrosa(request, result);
    const modules = [{ moduleId: "essentia.tfInstrumentRegions", moduleName: "Candidates", visible: true,
        state: { data: [{ position: [16000, 48000], name: "Manually reviewed", color: "#4e94ce" }] } }];
    store.scheduleDocument(modules, () => {});
    await store.flushDocument();
    const reopened = new WorkspaceAnalysisStore(root, "tf-audio", "renamed.wav");
    const loaded = await reopened.loadLibrosa(request);
    assert.deepEqual(loaded.matrix.map(row => [...row]), result.matrix);
    assert.deepEqual(loaded.labels, result.labels);
    assert.deepEqual(loaded.metadata, result.metadata);
    assert.deepEqual((await reopened.loadDocument()).modulesState, modules);
    assert.equal(await reopened.loadLibrosa({ ...request, engine: "essentia" }), undefined);
});

test("saves module state under the matching audio hash", async () => {
    const root = new MemoryDirectoryHandle();
    const store = new WorkspaceAnalysisStore(root, "abc123", "album/track.wav");
    assert.equal(await store.loadDocument(), undefined);
    await store.enableWriting();
    store.scheduleDocument([{ moduleId: "marker", moduleName: "Markers", visible: true, state: { name: "Form", data: [{ position: 42, name: "A", color: "#fff" }] } }], () => {});
    await store.flushDocument();
    assert.equal((await new WorkspaceAnalysisStore(root, "abc123", "elsewhere.wav").loadDocument()).modulesState[0].state.data[0].position, 42);
    assert.equal(await new WorkspaceAnalysisStore(root, "other", "album/track.wav").loadDocument(), undefined);
});

test("round-trips librosa matrices as Float32 before the caller clears JSON rows", async () => {
    const root = new MemoryDirectoryHandle();
    const store = new WorkspaceAnalysisStore(root, "matrix-audio", "track.wav");
    await store.enableWriting();
    const request = { algorithm: "mfcc", options: { hopLength: 512, coefficients: 2 } };
    const result = { algorithm: "mfcc", sampleRate: 22050, duration: 2, matrix: [[1.25, -2.5], [3.75, 4.5]], metadata: { hopLength: 512 } };
    const saving = store.saveLibrosa(request, result);
    result.matrix[0] = [];
    await saving;
    const loaded = await store.loadLibrosa({ algorithm: "mfcc", options: { coefficients: 2, hopLength: 512 } });
    assert.deepEqual(loaded.matrix.map(row => [...row]), [[1.25, -2.5], [3.75, 4.5]]);
    assert.equal(loaded.cache.status, "hit");
    assert.equal(await store.loadLibrosa({ ...request, cachePolicy: "refresh" }), undefined);
});

test("metadata is audio-specific and round-trips without recomputation", async () => {
    const root = new MemoryDirectoryHandle();
    const store = new WorkspaceAnalysisStore(root, "metadata-audio", "track.wav");
    await store.enableWriting();
    const metadata = { values: { title: "A", form: [{ id: "a", start: 1.5, end: 3, label: "A" }], valence: 0, arousal: null }, sources: { title: "user", form: "user" } };
    store.scheduleDocument([], () => {}, metadata);
    metadata.values.title = "Mutated after scheduling";
    await store.flushDocument();
    const restored = await new WorkspaceAnalysisStore(root, "metadata-audio", "renamed.wav").loadDocument();
    assert.equal(restored.metadata.values.title, "A");
    assert.deepEqual(restored.metadata.values.form, [{ id: "a", start: 1.5, end: 3, label: "A" }]);
    assert.equal(restored.metadata.sources.form, "user");
    assert.equal(restored.metadata.values.valence, 0);
    assert.equal(await new WorkspaceAnalysisStore(root, "different-audio", "track.wav").loadDocument(), undefined);
});

test("persists VA pairs, DTW gaps and region module binding in the workspace document", async () => {
    const root = new MemoryDirectoryHandle();
    const store = new WorkspaceAnalysisStore(root, "feature-audio", "track.wav");
    await store.enableWriting();
    const modules = [
        { moduleId: "music.va", moduleName: "Mood", visible: true, state: { kind: "va", points: [{ time: 1, values: [.25, -.4] }], source: "Manual" } },
        { moduleId: "music.performed-tempo", moduleName: "Tempo", visible: true, state: { kind: "performed", points: [{ time: 1, values: [null] }, { time: 2, values: [90] }] } },
        { moduleId: "music.form-regions", moduleName: "Form", visible: true, state: { field: "form", data: [{ name: "A", position: [0, 22050], color: "#4e94ce" }], candidates: [] } }
    ];
    store.scheduleDocument(modules, () => {});
    await store.flushDocument();
    assert.deepEqual((await new WorkspaceAnalysisStore(root, "feature-audio", "track.wav").loadDocument()).modulesState, modules);
});

test("VA menu cache survives module deletion and folder reload; reset removes it", async () => {
    const root = new MemoryDirectoryHandle(), hash = "d".repeat(64);
    const store = new WorkspaceAnalysisStore(root, hash, "track.wav");
    await store.enableWriting();
    const cachedModuleStates = [{ moduleId: "music.va", state: { kind: "va", points: [{ time: 1, values: [.25, -.4] }], source: "Manual" } }];
    store.scheduleDocument([], () => {}, undefined, cachedModuleStates);
    cachedModuleStates[0].state.points[0].values[0] = .9;
    await store.flushDocument();
    const document = await new WorkspaceAnalysisStore(root, hash, "track.wav").loadDocument();
    assert.deepEqual(document.modulesState, []);
    assert.equal(document.cachedModuleStates[0].state.points[0].values[0], .25);
    await store.resetLocal();
    store.scheduleDocument([], () => {}, undefined, cachedModuleStates);
    await store.flushDocument();
    assert.equal(await new WorkspaceAnalysisStore(root, hash, "track.wav").loadDocument(), undefined);
});
