import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
async function bundle(path) {
    const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const { beatsAtScoreTime, performedTempo } = await bundle("../src/modules/music-features/PerformedTempo.ts");
const { inferScoreStructure } = await bundle("../src/modules/music-features/ScoreStructure.ts");
test("performed tempo measures beat clock over audio, not encoded BPM", () => {
    const clock = [{ time: 0, bpm: 120, beats: 0 }];
    const curve = performedTempo([{ scoreTime: 0, audioTime: 0 }, { scoreTime: 10, audioTime: 20 }], clock, 2, 1);
    assert.ok(curve.every(point => Math.abs(point.values[0] - 60) < 1e-7));
});
test("score tempo change does not invent a performed tempo change", () => {
    const clock = [{ time: 0, bpm: 120, beats: 0 }, { time: 5, bpm: 60, beats: 10 }];
    assert.equal(beatsAtScoreTime(clock, 7), 12);
    const curve = performedTempo([{ scoreTime: 0, audioTime: 0 }, { scoreTime: 5, audioTime: 10 }, { scoreTime: 10, audioTime: 15 }], clock, 2, .5);
    assert.ok(curve.every(point => Math.abs(point.values[0] - 60) < 1e-7));
});
test("DTW pauses are gaps and invalid / missing paths never generate an artificial curve", () => {
    assert.deepEqual(performedTempo([], []), []);
    assert.deepEqual(performedTempo([{ scoreTime: 2, audioTime: 1 }, { scoreTime: 1, audioTime: 2 }], []), []);
    const curve = performedTempo([{ scoreTime: 0, audioTime: 0 }, { scoreTime: 2, audioTime: 2 }, { scoreTime: 2, audioTime: 10 }, { scoreTime: 4, audioTime: 12 }], [{ time: 0, bpm: 120, beats: 0 }], 2, 1);
    assert.equal(curve.find(point => point.time === 6).values[0], null);
    assert.throws(() => performedTempo([{ scoreTime: 0, audioTime: 0 }, { scoreTime: 1, audioTime: 1 }], [], 2, 0));
});
test("score section inference produces editable A/B/A labels without question marks", () => {
    const notes = Array.from({ length: 24 }, (_, index) => ({ id: String(index), trackId: "piano", time: index, duration: .5, velocity: .8, pitch: index >= 8 && index < 16 ? 66 : 60 }));
    const result = inferScoreStructure(notes, notes.map(note => note.time), 24, 4);
    assert.deepEqual(result.map(region => region.label), ["A", "B", "A"]);
    assert.deepEqual(result.map(region => region.start), [0, 8, 16]);
    assert.equal(result.at(-1).end, 24);
    assert.deepEqual(inferScoreStructure([], [0], 1), []);
});
