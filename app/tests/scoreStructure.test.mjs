import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import createModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import midiPackage from "@tonejs/midi";
const { Midi } = midiPackage;
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/modules/music-features/ScoreStructure.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const { inferScoreStructure } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("K545 detects long repeated passages and does not label the final four sections A", async () => {
    const toolkit = new VerovioToolkit(await createModule());
    try {
        toolkit.setOptions({ breaks: "none", pageWidth: 2100, adjustPageWidth: true, adjustPageHeight: true });
        toolkit.loadData(readFileSync(new URL("../../examples/k545-1.xml", import.meta.url), "utf8"));
        const svg = toolkit.renderToSVG(1), midi = new Midi(Buffer.from(toolkit.renderToMIDI(), "base64"));
        const notes = midi.tracks.flatMap((track, index) => track.notes.map(note => ({ trackId: `${index}`, pitch: note.midi, time: note.time, duration: note.duration })));
        const times = [...svg.matchAll(/<g[^>]*\bid="([^"]+)"[^>]*\bclass="measure"/g)].map(match => toolkit.getTimeForElement(match[1]) / 1000);
        const sections = inferScoreStructure(notes, times, midi.duration);
        assert.ok(sections.some(region => region.start === times[28]), "exposition repeat boundary");
        assert.ok(sections.some(region => region.start === times[101]), "second-half repeat boundary");
        const returns = [69, 114].map(index => sections.find(region => region.start === times[index]));
        assert.ok(returns.every(region => region?.label === "A′"), "transposed opening-theme returns must split from development");
        const last = sections.slice(-6).map(region => region.label);
        assert.equal(new Set(last).size, 3);
        assert.deepEqual(last.slice(0, 3), last.slice(3));
        sections.forEach((section, index) => { if (index) { assert.equal(section.start, sections[index - 1].end); assert.notEqual(section.label, sections[index - 1].label); } });
    } finally { toolkit.destroy(); }
});

test("equal pitch histograms do not collapse ascending and descending themes", () => {
    const pitches = [60, 62, 64, 65, 67, 69, 71, 72];
    const notes = Array.from({ length: 24 }, (_, bar) => (bar >= 8 && bar < 16 ? [...pitches].reverse() : pitches).map((pitch, index) => ({ time: bar + index / 8, duration: 1 / 8, pitch }))).flat();
    const regions = inferScoreStructure(notes, Array.from({ length: 24 }, (_, index) => index), 24, 4);
    assert.deepEqual(regions.map(region => region.label), ["A", "B", "A"]);
});
