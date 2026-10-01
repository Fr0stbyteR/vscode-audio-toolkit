import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function bundle(path) {
    const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const { curveVectors } = await bundle("../src/modules/music-features/CurveVectors.ts");
const { default: Vector } = await bundle("../src/core/VectorImageProcessor.ts");
function context() {
    const operations = [];
    const ctx = { canvas: { width: 400, height: 100 } };
    for (const method of ["save", "restore", "beginPath", "rect", "clip", "clearRect", "moveTo", "lineTo", "fillRect", "stroke", "setLineDash"]) ctx[method] = (...args) => operations.push([method, ...args]);
    return { ctx, operations };
}

test("curve vectors keep uneven timestamps, separate V/A and preserve null gaps", () => {
    const vectors = curveVectors([{ time: 0, values: [0, .5] }, { time: .25, values: [null, -.5] }, { time: 2, values: [1, 0] }], 44100, 2, 88200);
    assert.equal(vectors.length, 2);
    assert.deepEqual([...vectors[0][0].samplePositions], [0, 11025, 88200]);
    assert.ok(Number.isNaN(vectors[0][0].vectors[0][1]));
    assert.deepEqual([...vectors[1][0].vectors[0]], [.5, -.5, 0]);
});
test("shared Vector renderer shows every sufficiently spaced sample at its true timestamp", () => {
    const { ctx, operations } = context();
    const slices = curveVectors([{ time: 0, values: [0] }, { time: 1, values: [1] }, { time: 4, values: [0] }], 1000, 1, 4000)[0];
    Vector.paint(ctx, slices, { width: 400, height: 100 }, { viewRange: [0, 4000] }, { phosphorColor: "#4e94ce" });
    assert.deepEqual(operations.filter(([method]) => method === "fillRect").map(([, x]) => x), [-2, 98, 398]);
    assert.deepEqual(operations.filter(([method]) => method === "lineTo").map(([, x]) => x), [100, 400]);
});
test("Vector cursor snaps to a real curve sample, including the endpoint, with integer audio indices", () => {
    const slices = curveVectors([{ time: 0, values: [0] }, { time: .25001, values: [1] }, { time: 4, values: [null] }], 44100, 1, 176400)[0];
    const info = Vector.getInfoFromCursor(slices, 28, 20, { width: 400, height: 100 }, { viewRange: [0, 176400] });
    assert.equal(info.pointIndex, 1);
    assert.equal(info.fromIndex, 11025);
    assert.equal(info.toIndex, 11026);
    assert.equal(info.value, 1);
    assert.ok(Math.abs(info.x - 25.001) < 1e-7);
    const end = Vector.getInfoFromCursor(slices, 400, 20, { width: 400, height: 100 }, { viewRange: [0, 176400] });
    assert.equal(end.pointIndex, 2);
    assert.ok(Number.isNaN(end.value));
});
test("step tempo remains constant to the next timestamp and gaps do not connect", () => {
    const { ctx, operations } = context();
    const slices = curveVectors([{ time: 0, values: [0] }, { time: 1, values: [1] }, { time: 2, values: [null] }, { time: 3, values: [0] }], 1000, 1, 4000)[0];
    Vector.paint(ctx, slices, { width: 400, height: 100, interpolation: "step" }, { viewRange: [0, 4000] }, {});
    assert.deepEqual(operations.filter(([method]) => method === "lineTo"), [["lineTo", 100, 50], ["lineTo", 100, 0], ["lineTo", 400, 50]]);
    assert.ok(operations.some(([method, x]) => method === "moveTo" && x === 300));
});
test("dense points hide their squares until zoomed; an isolated valid point still shows", () => {
    const slices = curveVectors([{ time: 0, values: [0] }, { time: 1, values: [1] }, { time: 2, values: [0] }], 1000, 1, 2000)[0];
    const dense = context();
    Vector.paint(dense.ctx, slices, { width: 10, height: 100 }, { viewRange: [0, 2000] }, {});
    assert.equal(dense.operations.filter(([method]) => method === "fillRect").length, 0);
    const zoomed = context();
    Vector.paint(zoomed.ctx, slices, { width: 400, height: 100 }, { viewRange: [0, 2000] }, {});
    assert.equal(zoomed.operations.filter(([method]) => method === "fillRect").length, 3);
    const isolated = context();
    Vector.paint(isolated.ctx, curveVectors([{ time: 1, values: [.5] }], 1000, 1, 2000)[0], {}, { viewRange: [0, 2000] }, {});
    assert.equal(isolated.operations.filter(([method]) => method === "fillRect").length, 1);
});

test("existing uniformly sampled vectors retain frame-center drawing and cursor behavior", () => {
    const previousPath = globalThis.Path2D;
    globalThis.Path2D = class { rect() {} };
    try {
        const vectors = [Float32Array.from([0, 1])];
        const slices = [{ startIndex: 0, endIndex: 2000, offsetFromSample: 0, audioSamplesPerSample: 1000, vectors, resizedVectors: Vector.generateResized(vectors, 1000) }];
        const { ctx, operations } = context();
        Vector.paint(ctx, slices, {}, { viewRange: [0, 2000] }, {});
        assert.deepEqual(operations.filter(([method]) => method === "fillRect").map(([, x]) => x), [98, 298]);
        const info = Vector.getInfoFromCursor(slices, 110, 20, { width: 400, height: 100 }, { viewRange: [0, 2000] });
        assert.equal(info.x, 100);
        assert.equal(info.fromIndex, 0);
        assert.equal(info.toIndex, 1000);
        assert.equal(info.value, 0);
    } finally {
        if (previousPath === undefined) delete globalThis.Path2D;
        else globalThis.Path2D = previousPath;
    }
});
