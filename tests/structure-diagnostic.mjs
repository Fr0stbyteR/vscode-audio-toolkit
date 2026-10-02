import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import createModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import midiPackage from '@tonejs/midi';
const { Midi } = midiPackage;
const bundled = await build({ entryPoints: ['src/modules/music-features/ScoreStructure.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { inferScoreStructure } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const toolkit = new VerovioToolkit(await createModule());
try {
    toolkit.setOptions({ breaks: 'none', pageWidth: 2100, adjustPageWidth: true, adjustPageHeight: true });
    toolkit.loadData(readFileSync(new URL('../examples/k545-1.xml', import.meta.url), 'utf8'));
    const svg = toolkit.renderToSVG(1), midi = new Midi(Buffer.from(toolkit.renderToMIDI(), 'base64'));
    const notes = midi.tracks.flatMap((track, i) => track.notes.map((note, j) => ({ id: `${i}-${j}`, trackId: `${i}`, pitch: note.midi, time: note.time, duration: note.duration, velocity: note.velocity })));
    const times = [...svg.matchAll(/<g[^>]*\bid="([^"]+)"[^>]*\bclass="measure"/g)].map(match => toolkit.getTimeForElement(match[1]) / 1000);
    console.log(JSON.stringify({ measures: times.length, notes: notes.length, duration: midi.duration, sections: inferScoreStructure(notes, times, midi.duration).map(region => ({...region, bar: times.indexOf(region.start) + 1})) }));
} finally { toolkit.destroy(); }
