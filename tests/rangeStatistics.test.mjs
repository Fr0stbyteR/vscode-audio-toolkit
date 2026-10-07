import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundled = await build({ entryPoints: [fileURLToPath(new URL("../src/core/RangeStatistics.ts", import.meta.url))], bundle: true, write: false, platform: "node", format: "esm" });
const { statisticsRange, calculateRangeStatistics, moduleStatisticsSource } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const slice = (vectors, extra = {}) => ({ startIndex: 0, endIndex: 100, offsetFromSample: 0, audioSamplesPerSample: 10, vectors: vectors.map(vector => Float32Array.from(vector)), ...extra });
const source = (vectors, extra = {}) => ({ kind: "vector", unit: "Hz", slices: [slice(vectors)], ...extra });

test("scope is automatically whole audio unless the clamped selection has positive duration", () => {
    for (const selection of [undefined, null, [20, 20], [NaN, 30], [-10, -2], [120, 150]]) assert.deepEqual(statisticsRange(selection, 100), { range: [0, 100], selected: false });
    assert.deepEqual(statisticsRange([50, 20], 100), { range: [20, 50], selected: true });
    assert.deepEqual(statisticsRange([-10, 30], 100), { range: [0, 30], selected: true });
});

test("vector selection is half-open, exact and independent of resized display data", async () => {
    const data = source([[1, 2, 3, 4, 5], [10, 20, NaN, 40, Infinity]], { labels: ["F1", "F2"] });
    const selected = await calculateRangeStatistics(data, [10, 40], 100);
    assert.equal(selected.channels[0].label, "F1");
    assert.deepEqual({ ...selected.channels[0].summary, rms: undefined }, { count: 3, mean: 3, min: 2, max: 4, std: Math.sqrt(2 / 3), rms: undefined });
    assert.ok(Math.abs(selected.channels[0].summary.rms - Math.sqrt(29 / 3)) < 1e-12);
    assert.equal(selected.channels[1].summary.count, 2);
    assert.equal(selected.channels[1].summary.mean, 30);
    const all = await calculateRangeStatistics(data, [0, 40], 100, { includeEnd: true });
    assert.equal(all.channels[0].summary.count, 5);
    assert.equal((await calculateRangeStatistics(data, [90, 100], 100)).channels[0].summary.count, 0);
});

test("timestamps, fractional hops, offsets and missing VA values are preserved", async () => {
    const data = { kind: "vector", unit: "", labels: ["Valence", "Arousal"], slices: [slice([[0, .5, NaN, -1], [1, .2, -.2, 0]], { samplePositions: Float64Array.from([0, 7.5, 25, 80]) })] };
    const stats = await calculateRangeStatistics(data, [7.5, 80], 100);
    assert.equal(stats.channels[0].summary.count, 1);
    assert.equal(stats.channels[0].summary.mean, .5);
    assert.equal(stats.channels[1].summary.count, 2);
    const offset = { kind: "vector", unit: "", slices: [slice([[1, 2, 3]], { startIndex: 20, offsetFromSample: 5, audioSamplesPerSample: 2.5 })] };
    assert.equal((await calculateRangeStatistics(offset, [17.5, 20], 100)).channels[0].summary.mean, 2);
});

test("compact persisted validity masks exclude unestimated frames, not genuine zeros", async () => {
    const data = source([[0, 0, 7, 1000]], { metadata: { "validity.0": Buffer.from([0b0101]).toString("base64") } });
    const stats = await calculateRangeStatistics(data, [0, 100], 100);
    assert.equal(stats.channels[0].summary.count, 2);
    assert.equal(stats.channels[0].summary.min, 0);
    assert.equal(stats.channels[0].summary.mean, 3.5);
});

test("matrix stats use original values and optionally one coefficient", async () => {
    const data = { kind: "matrix", unit: "MFCC", slices: [{ startIndex: 0, endIndex: 40, resizedMatrices: { resizes: [{ offsetFromFrame: 0, audioSamplesPerFrame: 10, data: [[[1, 10], [2, 20], [3, 30], [4, 40]].map(row => Float32Array.from(row))] }, { data: [[Float32Array.from([999])]] }] } }] };
    const stats = await calculateRangeStatistics(data, [10, 30], 100);
    assert.equal(stats.channels[0].summary.count, 4);
    assert.equal(stats.channels[0].summary.mean, 13.75);
    assert.equal((await calculateRangeStatistics(data, [10, 30], 100, { bin: 1 })).channels[0].summary.mean, 25);
    data.metadata = { "validity.1": Buffer.from([0b0010]).toString("base64") };
    assert.equal((await calculateRangeStatistics(data, [10, 30], 100, { bin: 1 })).channels[0].summary.count, 1);
});

test("markers clip intersecting regions and union coverage without double-counting", async () => {
    const data = { kind: "markers", markers: [{ position: 20 }, { position: 50 }, { position: 70 }, { position: [10, 40] }, { position: [30, 60] }, { position: [90, 99] }] };
    const stats = await calculateRangeStatistics(data, [20, 50], 10);
    assert.equal(stats.points, 1);
    assert.equal(stats.regions, 2);
    assert.equal(stats.coveredSeconds, 3);
    assert.equal(stats.channels[0].summary.mean, 2);
});

test("score notes overlapping the selection contribute pitch and clipped duration", async () => {
    const stats = await calculateRangeStatistics({ kind: "notes", notes: [{ start: 0, end: 30, pitch: 60 }, { start: 20, end: 60, pitch: 72 }, { start: 50, end: 70, pitch: 90 }] }, [10, 50], 10);
    assert.equal(stats.notes, 2);
    assert.equal(stats.channels[0].summary.mean, 66);
    assert.equal(stats.channels[1].summary.mean, 2.5);
});

test("score statistics follow the actual alignment and exclude hidden instruments", async () => {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/modules/score/ScoreStatistics.ts", import.meta.url))], bundle: true, write: false, platform: "node", format: "esm" });
    const { scoreStatisticsSource } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    const notes = [{ time: 1, duration: 1, pitch: 60, trackId: "piano" }, { time: 1, duration: 1, pitch: 72, trackId: "flute" }];
    const data = scoreStatisticsSource(notes, [{ scoreTime: 0, audioTime: 0 }, { scoreTime: 4, audioTime: 8 }], 100, ["flute"]);
    assert.deepEqual(data.notes, [{ start: 200, end: 400, pitch: 60 }]);
    const stats = await calculateRangeStatistics(data, [300, 500], 100);
    assert.equal(stats.notes, 1);
    assert.equal(stats.channels[1].summary.mean, 1);
});

test("capability adapter covers existing waveform, matrix and CLAP data without fabricating descriptor stats", () => {
    assert.equal(moduleStatisticsSource({ moduleId: "waveform", dataSlices: [slice([[1]])] }).unit, "Amplitude");
    assert.equal(moduleStatisticsSource({ moduleId: "embedding.relevance-curve", unit: "cos", dataSlices: [slice([[1]])] }).kind, "vector");
    assert.equal(moduleStatisticsSource({ moduleId: "spectrogram", dataSlices: [{ resizedMatrices: {} }] }).unit, "dB");
    assert.equal(moduleStatisticsSource({ moduleId: "embedding.description" }), undefined);
});

test("long waveform scans yield to the event loop and cancel obsolete selection work", async () => {
    const controller = new AbortController();
    const vector = new Float32Array(2_000_000).fill(.5);
    const data = { kind: "vector", unit: "Amplitude", slices: [slice([], { vectors: [vector], audioSamplesPerSample: 1 })] };
    const timer = setTimeout(() => controller.abort(), 0);
    await assert.rejects(calculateRangeStatistics(data, [0, vector.length], 48000, { signal: controller.signal }), error => error.name === "AbortError");
    clearTimeout(timer);
    const stats = await calculateRangeStatistics(data, [0, vector.length], 48000);
    assert.equal(stats.channels[0].summary.count, vector.length);
    assert.equal(stats.channels[0].summary.mean, .5);
});
