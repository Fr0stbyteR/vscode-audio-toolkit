import assert from "node:assert/strict";
import { test } from "node:test";
import { selectAlignmentGuides } from "../src/modules/score/AlignmentGuides.ts";

test("collapses note fans at one DTW position and prefers a measure boundary", () => {
    const guides = [
        { id: "m1", kind: "measure", time: 0, audioX: 0 },
        { id: "n1", kind: "note", time: 0, audioX: 0 },
        { id: "n2", kind: "note", time: 0.25, audioX: 0 },
        { id: "n3", kind: "note", time: 0.5, audioX: 0 },
        { id: "m2", kind: "measure", time: 2, audioX: 200 },
        { id: "n4", kind: "note", time: 2.25, audioX: 203 },
        { id: "n5", kind: "note", time: 2.5, audioX: 230 }
    ];
    assert.deepEqual(selectAlignmentGuides(guides).map(guide => guide.id), ["m1", "m2", "n5"]);
});

test("keeps one representative for crowded notes with no measure", () => {
    const guides = [
        { id: "a", kind: "note", time: 1, audioX: 40 },
        { id: "b", kind: "note", time: 1.1, audioX: 42 },
        { id: "c", kind: "note", time: 1.2, audioX: 44 }
    ];
    assert.deepEqual(selectAlignmentGuides(guides).map(guide => guide.id), ["b"]);
});
