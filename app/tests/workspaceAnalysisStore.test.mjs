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
    directories = new Map();
    files = new Map();
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
