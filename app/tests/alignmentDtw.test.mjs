import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

globalThis.self = { postMessage() {} };

const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/modules/score/alignment.worker.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false
});
const { dtw } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function feature(pitchClass) {
    const vector = new Float32Array(13);
    vector[pitchClass] = 1;
    return vector;
}

test("DTW centers a score frame that spans repeated audio frames", () => {
    const score = [feature(0), feature(2), feature(4)];
    const audio = [feature(0), feature(2), feature(2), feature(2), feature(4)];
    const points = dtw(score, audio, 2, 4);

    assert.deepEqual(points.map(point => point.scoreTime), [0, 1, 2]);
    assert.equal(points[1].audioTime, 2);
});
