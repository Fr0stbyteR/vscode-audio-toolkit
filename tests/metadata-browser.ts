import { inferScoreMetadata } from "../src/modules/score/ScoreMetadata";
import { importScore, loadScore } from "../src/modules/score/ScoreLibrary";
import createModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";

async function run() {
    const status = document.getElementById("status")!;
    const expect = (value: unknown, label: string) => { if (!value) throw new Error(label); };
    const xml = await (await fetch("./fixtures/two-measures.musicxml")).text();
    const rich = xml.replace('<measure implicit="no" number="2">', '<measure implicit="no" number="2"><attributes><key><fifths>-3</fifths><mode>minor</mode></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes><direction><direction-type><rehearsal>B</rehearsal></direction-type><sound tempo="90"/></direction>')
        .replace('<note default-x="79.26"', '<direction><direction-type><rehearsal>A</rehearsal><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>80</per-minute></metronome></direction-type></direction><note default-x="79.26"');
    const inferred = inferScoreMetadata(rich, [0, 2], 4);
    expect(inferred.title === "Two measures" && inferred.composer === "Test" && inferred.instruments?.join() === "Piano", "Basic score declarations");
    const synth = rich.replace("<instrument-name>Piano</instrument-name>", "<instrument-name>SmartMusic SoftSynth</instrument-name>");
    expect(inferScoreMetadata(synth, [0, 2], 4).instruments?.join() === "Piano", "Part name overrides playback synth name");
    expect(inferred.keys?.[1].label === "C minor" && inferred.keys[1].start === 2, "Key change at barline");
    expect(inferred.meters?.[1].label === "3/4" && inferred.meters[0].end === 2, "Meter regions");
    expect(inferred.tempo?.[0].bpm === 120 && inferred.tempo?.[1].bpm === 90, "Dotted metronome and tempo changes");
    expect(inferred.form?.map(row => row.label).join("") === "AB" && inferred.form[0].end === 2, "Explicit section labels");
    expect(inferred.valence === undefined && inferred.context === undefined && inferred.theme === undefined, "No invented subjective labels");
    const parsed = await loadScore((await importScore(new File([xml], "metadata.musicxml"))).key);
    expect(parsed.metadata?.title === "Two measures" && parsed.metadata.meters?.[0].end === parsed.duration, "Metadata from real Verovio import");
    const toolkit = new VerovioToolkit(await createModule());
    try {
        toolkit.loadData(rich);
        const converted = inferScoreMetadata(toolkit.getMEI(), [0, 2], 4);
        expect(converted.title === "Two measures" && converted.instruments?.join() === "Piano", "Compressed-score MEI basic metadata");
        expect(converted.keys?.length === 2 && converted.meters?.length === 2, "Converted MEI key/meter changes");
        expect(converted.tempo?.length === 2, "Converted MEI tempo declarations");
    } finally { toolkit.destroy(); }
    status.textContent = "PASS · title, composer, instruments, key/meter regions, tempo changes, dotted metronome, section labels, real score import";
}
run().catch(reason => { const status = document.getElementById("status")!; status.textContent = `FAIL · ${String(reason)}`; status.setAttribute("role", "alert"); });
