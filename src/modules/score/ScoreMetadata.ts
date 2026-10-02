import { MusicMetadataValues, MusicRegion } from "../../core/MusicMetadata";
import { instrumentByPatchID } from "@tonejs/midi/dist/InstrumentMaps";

/** Synth/renderer names describe playback, not the musical instrument. XML programs are 1-based. */
export function scoreInstrumentName(instrument: string, part: string, program?: number, channel?: number) {
    const meaningful = (name: string) => name.trim() && !/smartmusic|softsynth|soundfont|synthesizer|general midi|^part\s*\d*$|^p\d+$/i.test(name.trim());
    if (meaningful(instrument)) return instrument.trim();
    if (meaningful(part)) return part.trim();
    if (channel === 10) return "Percussion";
    if (program === 1) return "Piano";
    if (program !== undefined && Number.isInteger(program) && program >= 1 && program <= 128) {
        const name = instrumentByPatchID[program - 1];
        return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return "";
}

const MAJOR = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
export function keyLabel(fifths: number, mode: string) {
    if (!Number.isInteger(fifths) || Math.abs(fifths) > 7) return "";
    // A signature does not establish tonic for church/pentatonic modes.
    if (mode && mode !== "major" && mode !== "minor" && mode !== "none") return `${Math.abs(fifths)} ${fifths < 0 ? "♭" : "♯"} · ${mode}`;
    if (!mode || mode === "none") return `${MAJOR[fifths + 7]} major / ${MINOR[fifths + 7]} minor`;
    return `${(mode === "minor" ? MINOR : MAJOR)[fifths + 7]} ${mode}`;
}

/** Only explicit score declarations, never guesses about mood/function. Times are score seconds. */
export function inferScoreMetadata(xml: string, measureTimes: number[], duration: number, midiTempos?: { time: number; bpm: number }[]): Partial<MusicMetadataValues> {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return {};
    const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent?.trim() || "";
    const result: Partial<MusicMetadataValues> = {};
    const mei = doc.documentElement.localName === "mei";
    result.title = text(doc, mei ? "titleStmt > title" : "work-title") || text(doc, "movement-title");
    result.composer = text(doc, mei ? "persName[role='composer']" : "creator[type='composer']");
    const instrumentNodes = doc.querySelectorAll(mei ? "staffDef" : "score-part");
    result.instruments = [...new Set(Array.from(instrumentNodes, node => {
        if (mei) {
            const definition = node.querySelector("instrDef");
            const program = definition?.getAttribute("midi.instrnum");
            return [scoreInstrumentName("", text(node, "label"), program ? Number(program) + 1 : undefined)];
        }
        const definitions = Array.from(node.querySelectorAll("score-instrument"));
        return (definitions.length ? definitions : [node]).map(definition => {
            const midi = Array.from(node.querySelectorAll("midi-instrument")).find(entry => entry.getAttribute("id") === definition.getAttribute("id")) ?? node.querySelector("midi-instrument");
            const program = midi ? text(midi, "midi-program") : "";
            return scoreInstrumentName(text(definition, "instrument-name"), text(node, "part-name"), program ? Number(program) : undefined, midi ? Number(text(midi, "midi-channel")) : undefined);
        });
    }).flat().filter(Boolean))];
    const changes: Record<"keys" | "meters" | "form", MusicRegion[]> = { keys: [], meters: [], form: [] };
    const measures = Array.from(doc.querySelectorAll(mei ? "section measure" : "part:first-of-type > measure"));
    const add = (field: keyof typeof changes, label: string, time: number) => {
        const list = changes[field];
        if (!label || list.at(-1)?.label === label) return;
        if (list.at(-1)?.start === time) list.pop();
        list.push({ id: `score-${field}-${list.length}-${time}`, start: time, end: duration, label });
    };
    const readDefinitions = (root: ParentNode, time: number) => {
        if (mei) {
            const def = root instanceof Element && root.matches("scoreDef") ? root : root.querySelector("scoreDef");
            const meter = (def || root).querySelector("meterSig");
            const count = def?.getAttribute("meter.count") || meter?.getAttribute("count");
            const unit = def?.getAttribute("meter.unit") || meter?.getAttribute("unit");
            if (count && unit) add("meters", `${count}/${unit}`, time);
            const keySig = (def || root).querySelector("keySig");
            const key = def?.getAttribute("key.sig") || keySig?.getAttribute("sig");
            if (key) add("keys", keyLabel(key === "0" ? 0 : parseInt(key) * (key.endsWith("f") ? -1 : 1), def?.getAttribute("key.mode") || keySig?.getAttribute("mode") || ""), time);
        } else {
            const fifths = text(root, "attributes > key > fifths");
            if (fifths !== "") add("keys", keyLabel(Number(fifths), text(root, "attributes > key > mode")), time);
            const meter = root.querySelector("attributes > time");
            if (meter) {
                const beats = Array.from(meter.querySelectorAll("beats"), el => el.textContent).join("+");
                const unit = text(meter, "beat-type");
                if (beats && unit) add("meters", `${beats}/${unit}`, time);
            }
        }
    };
    if (mei) readDefinitions(doc, 0);
    result.tempo = [];
    measures.forEach((measure, index) => {
        const time = measureTimes[index];
        if (!Number.isFinite(time)) return; // Never manufacture missing bar timings.
        if (mei && measure.previousElementSibling?.matches("scoreDef")) readDefinitions(measure.previousElementSibling, time);
        readDefinitions(measure, time);
        add("form", text(measure, mei ? "reh" : "rehearsal"), time);
        const tempo = measure.querySelector(mei ? "tempo" : "sound[tempo]");
        let bpm = Number(tempo?.getAttribute(mei ? "midi.bpm" : "tempo"));
        if (!bpm && mei) bpm = Number(tempo?.getAttribute("mm")) * (4 / Number(tempo?.getAttribute("mm.unit") || "4"));
        if (!bpm && !mei) {
            const perMinute = Number(text(measure, "metronome > per-minute"));
            const units: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: .5, "16th": .25 };
            const dot = measure.querySelector("metronome > beat-unit-dot") ? 1.5 : 1;
            bpm = perMinute * (units[text(measure, "metronome > beat-unit")] || 0) * dot;
        }
        if (Number.isFinite(bpm) && bpm > 0 && result.tempo!.at(-1)?.bpm !== bpm) result.tempo!.push({ id: `score-tempo-${index}`, time, bpm });
    });
    // MIDI supplies exact intra-bar tempo timestamps; only use it if the score
    // actually declares tempo, not Verovio's synthetic default of 120 BPM.
    if (result.tempo.length && midiTempos?.length) result.tempo = midiTempos.filter(point => Number.isFinite(point.time) && point.time >= 0 && point.time <= duration && point.bpm > 0).map((point, index) => ({ ...point, id: `score-tempo-${index}` }));
    for (const field of ["keys", "meters", "form"] as const) {
        const list = changes[field];
        list.forEach((region, index) => { region.end = list[index + 1]?.start ?? duration; });
        result[field] = list;
    }
    return result;
}
