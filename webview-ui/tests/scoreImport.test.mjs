import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ToneMidi from "@tonejs/midi";
import createModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";

test("Verovio renders one horizontal system with timed notes and MIDI export", async () => {
    const toolkit = new VerovioToolkit(await createModule());
    try {
        toolkit.setOptions({ inputFrom: "xml", breaks: "none", scale: 40, adjustPageHeight: true, adjustPageWidth: true, pageWidth: 2100, svgViewBox: true });
        const xml = readFileSync(new URL("./fixtures/two-measures.musicxml", import.meta.url), "utf8");
        assert.equal(toolkit.loadData(xml), 1);
        assert.equal(toolkit.getPageCount(), 1);
        const svg = toolkit.renderToSVG(1);
        const ids = [...svg.matchAll(/<g\s+id="([^"]+)"\s+class="note"/g)].map(match => match[1]);
        assert.equal(ids.length, 8);
        const midi = new ToneMidi.Midi(Uint8Array.from(Buffer.from(toolkit.renderToMIDI(), "base64")));
        assert.equal(midi.tracks.flatMap(track => track.notes).length, 8);
        assert.equal(midi.duration, 4);
        toolkit.renderToMIDI();
        assert.equal(toolkit.getTimeForElement(ids[0]), 0);
        assert.deepEqual(ids.map(id => toolkit.getTimeForElement(id)), [0, 500, 1000, 1500, 2000, 2500, 3000, 3500]);
        assert.equal(toolkit.getTimeForElement(ids[4]), 2000);
    } finally {
        toolkit.destroy();
    }
});
