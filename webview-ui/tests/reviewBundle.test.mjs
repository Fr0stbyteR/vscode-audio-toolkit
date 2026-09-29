import assert from "node:assert/strict";
import { test } from "node:test";
import { makeReviewBundle } from "../src/standalone/ReviewBundle.ts";

const annotation = (state) => ({ state });
const document = (assetKey, updatedAt, states) => ({
    schemaVersion: 1, assetKey, fileName: `${assetKey}.wav`, sampleRate: 44100, sampleCount: 44100,
    annotations: states.map(annotation), updatedAt
});

test("review bundle deduplicates assets and preserves review states", () => {
    const bundle = makeReviewBundle([
        document("a", "2026-01-01", ["suggested"]),
        document("a", "2026-01-02", ["confirmed", "rejected"]),
        document("b", "2026-01-01", ["ambiguous"])
    ], "2026-01-03");
    assert.equal(bundle.purpose, "review-exchange-not-training");
    assert.equal(bundle.assetIdentity, "sampled-content-hash-v1");
    assert.deepEqual(bundle.summary, { files: 2, annotations: 3, suggested: 0, confirmed: 1, rejected: 1, ambiguous: 1 });
    assert.equal(bundle.generatedAt, "2026-01-03");
});
