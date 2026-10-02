import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function bundle(path) {
    const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const { emptyMetadata, mergeScoreMetadata, restoreMetadata } = await bundle("../src/core/MusicMetadata.ts");
const { layerInsertionIndex } = await bundle("../src/components/layerOrder.ts");
const { keyLabel, scoreInstrumentName } = await bundle("../src/modules/score/ScoreMetadata.ts");
const inferred = { scoreKey: "score", fileName: "score.xml", values: { title: "From score", instruments: ["Piano"], keys: [{ id: "k1", start: 0, end: 8, label: "C major" }] } };

test("score fills empty fields without modifying the current document", () => {
    const current = emptyMetadata();
    const next = mergeScoreMetadata(current, inferred);
    assert.equal(next.values.title, "From score");
    assert.equal(next.sources.title, "musicxml");
    assert.equal(current.values.title, "");
    assert.equal(next.values.valence, null);
    assert.equal(next.values.context, "");
});
test("preserves manual text, deliberately cleared fields and manual regions", () => {
    const current = emptyMetadata();
    current.values.title = "My title";
    current.values.keys = [{ id: "manual", start: 1, end: 7, label: "D dorian" }];
    current.sources = { title: "user", keys: "user", instruments: "user" };
    const next = mergeScoreMetadata(current, inferred);
    assert.equal(next.values.title, "My title");
    assert.deepEqual(next.values.instruments, []);
    assert.deepEqual(next.values.keys, current.values.keys);
    assert.deepEqual(next.inferred, inferred);
});
test("preserves existing values without provenance; overrides only explicitly selected fields", () => {
    const current = emptyMetadata();
    current.values.title = "Existing";
    current.values.instruments = ["Violin"];
    assert.equal(mergeScoreMetadata(current, inferred).values.title, "Existing");
    const next = mergeScoreMetadata(current, inferred, ["title"]);
    assert.equal(next.values.title, "From score");
    assert.deepEqual(next.values.instruments, ["Violin"]);
});
test("a new score refreshes automatic fields and alignment timing but not user values", () => {
    const current = mergeScoreMetadata(emptyMetadata(), inferred);
    current.values.title = "Manual"; current.sources.title = "user";
    const next = mergeScoreMetadata(current, { ...inferred, values: { title: "New", instruments: [], keys: [{ id: "k1", start: 0, end: 10, label: "C major" }] } });
    assert.equal(next.values.title, "Manual");
    assert.deepEqual(next.values.instruments, []);
    assert.equal(next.values.keys[0].end, 10);
});
test("layer insertion boundaries honor displayed column and reversed overlay order", () => {
    const column = [1, 2, 3, 4], overlay = [4, 3, 2, 1];
    assert.equal(layerInsertionIndex(column, 4, 0, false), 1);
    assert.equal(layerInsertionIndex(column, 1, 4, false), 4);
    assert.equal(layerInsertionIndex(column, 2, 2, false), 2);
    assert.equal(layerInsertionIndex(overlay, 1, 0, true), 4);
    assert.equal(layerInsertionIndex(overlay, 4, 4, true), 1);
    assert.equal(layerInsertionIndex(overlay, 3, 2, true), 3);
});
test("key declarations respect major/minor and do not assume a modal tonic", () => {
    assert.equal(keyLabel(-3, "minor"), "C minor");
    assert.equal(keyLabel(2, "major"), "D major");
    assert.equal(keyLabel(0, ""), "C major / A minor");
    assert.match(keyLabel(0, "dorian"), /dorian/);
    assert.equal(keyLabel(Infinity, "major"), "");
});

test("old and malformed documents restore safe defaults while preserving valid edits", () => {
    assert.deepEqual(restoreMetadata(undefined), emptyMetadata());
    const restored = restoreMetadata({ values: { title: "Saved", valence: 0, form: null, tempo: [{ id: "bad", time: -1, bpm: 90 }] }, sources: { title: "user", form: "user" } });
    assert.equal(restored.values.title, "Saved");
    assert.equal(restored.values.valence, 0);
    assert.deepEqual(restored.values.form, []);
    assert.deepEqual(restored.values.tempo, []);
    assert.equal(restored.sources.form, "user");
});

test("instrument lists migrate legacy strings, including saved score suggestions", () => {
    const restored = restoreMetadata({ values: { instruments: "Piano, Violin; Flute\nPiano" }, sources: { instruments: "user" }, inferred: { scoreKey: "s", fileName: "s.xml", values: { instruments: "Piano" } } });
    assert.deepEqual(restored.values.instruments, ["Piano", "Violin", "Flute"]);
    assert.equal(restored.sources.instruments, "user");
    assert.deepEqual(restored.inferred.values.instruments, ["Piano"]);
    assert.deepEqual(restoreMetadata({ values: { instruments: [" Piano ", null, 3, "", "Violin", "Piano"] } }).values.instruments, ["Piano", "Violin"]);
});

test("instrument identity ignores playback synths and uses explicit names or GM fallback", () => {
    assert.equal(scoreInstrumentName("SmartMusic SoftSynth", "Piano", 1), "Piano");
    assert.equal(scoreInstrumentName("SmartMusic SoftSynth", "Part 1", 1), "Piano");
    assert.equal(scoreInstrumentName("Violin", "P1", 41), "Violin");
    assert.equal(scoreInstrumentName("", "Part 2", 41), "Violin");
    assert.equal(scoreInstrumentName("", "", undefined, 10), "Percussion");
    assert.equal(scoreInstrumentName("SmartMusic SoftSynth", "Part 1"), "");
});
