import { importScore, loadScore } from "../src/modules/score/ScoreLibrary";
import { alignScoreToAudio } from "../src/modules/score/Alignment";
import { Midi } from "@tonejs/midi";

const status = document.getElementById("status")!;
const host = document.getElementById("score")!;

async function run() {
    const response = await fetch("./fixtures/two-measures.musicxml");
    if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`);
    const file = new File([await response.arrayBuffer()], "two-measures.musicxml", { type: "application/vnd.recordare.musicxml+xml" });
    const imported = await importScore(file);
    const score = await loadScore(imported.key);
    const midi = new Midi();
    const track = midi.addTrack();
    for (const note of score.notes) track.addNote({ midi: note.pitch, time: note.time, duration: note.duration, velocity: note.velocity });
    const midiFile = new File([new Uint8Array(midi.toArray())], "two-measures.mid", { type: "audio/midi" });
    const importedMidi = await importScore(midiFile);
    const parsedMidi = await loadScore(importedMidi.key);
    const sampleRate = 11025;
    const samples = new Float32Array(Math.ceil(score.duration * sampleRate));
    for (const note of score.notes) {
        const frequency = 440 * 2 ** ((note.pitch - 69) / 12);
        for (let index = Math.floor(note.time * sampleRate); index < Math.min(samples.length, Math.ceil((note.time + note.duration) * sampleRate)); index++) {
            samples[index] += 0.2 * Math.sin(2 * Math.PI * frequency * index / sampleRate);
        }
    }
    const alignment = await alignScoreToAudio(samples, score.notes, score.duration, score.duration);
    status.textContent = `${score.tracks.length} track(s), ${score.notes.length} MusicXML notes, ${parsedMidi.notes.length} MIDI notes, ${score.events.length} events, ${alignment.length} alignment points`;
    if (score.svg) host.innerHTML = score.svg;
}

run().catch(error => { status.textContent = String(error); status.setAttribute("role", "alert"); });
