import { Midi } from "@tonejs/midi";
import { MusicMetadataValues } from "../../core/MusicMetadata";
import { inferScoreMetadata } from "./ScoreMetadata";
import type { BeatClockPoint } from "../music-features/PerformedTempo";

export type ScoreFormat = "musicxml" | "mxl" | "midi";
export interface ScoreNote { id: string; trackId: string; pitch: number; time: number; duration: number; velocity: number; }
export interface ScoreTrack { id: string; name: string; instrument: string; color: string; }
export interface ScoreEvent { id: string; time: number; kind: "measure" | "note"; label?: string; }
export interface ParsedScore {
    format: ScoreFormat;
    name: string;
    duration: number;
    tracks: ScoreTrack[];
    notes: ScoreNote[];
    events: ScoreEvent[];
    svg?: string;
    metadata?: Partial<MusicMetadataValues>;
    beatClock: BeatClockPoint[];
}
export interface StoredScore { key: string; name: string; format: ScoreFormat; data: ArrayBuffer; }

const DB_NAME = "audio-toolkit-scores";
const STORE_NAME = "scores";
const parsed = new Map<string, Promise<ParsedScore>>();

function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "key" }); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Could not open score storage"));
    });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
    const db = await database();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, mode);
            transaction.onerror = () => reject(transaction.error ?? new Error("Score storage failed"));
            action(transaction.objectStore(STORE_NAME), resolve, reject);
        });
    } finally { db.close(); }
}

function fileFormat(name: string): ScoreFormat {
    if (/\.mxl$/i.test(name)) return "mxl";
    if (/\.(mid|midi)$/i.test(name)) return "midi";
    if (/\.(musicxml|xml)$/i.test(name)) return "musicxml";
    throw new Error("Choose a MusicXML (.musicxml, .xml, .mxl) or MIDI (.mid, .midi) file.");
}

export async function importScore(file: File): Promise<{ key: string; name: string; format: ScoreFormat }> {
    const format = fileFormat(file.name);
    const data = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", data);
    const key = Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
    await withStore<void>("readwrite", (store, resolve, reject) => {
        const request = store.put({ key, name: file.name, format, data } satisfies StoredScore);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    parsed.delete(key);
    return { key, name: file.name, format };
}

export async function loadScoreSource(key: string): Promise<StoredScore | undefined> {
    return withStore<StoredScore | undefined>("readonly", (store, resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result as StoredScore | undefined);
        request.onerror = () => reject(request.error);
    });
}

export async function loadScore(key: string): Promise<ParsedScore> {
    let promise = parsed.get(key);
    if (!promise) {
        promise = (async () => {
            const stored = await withStore<StoredScore | undefined>("readonly", (store, resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result as StoredScore | undefined);
                request.onerror = () => reject(request.error);
            });
            if (!stored) throw new Error("The score file is no longer in local storage. Import it again.");
            return parseScore(stored);
        })();
        parsed.set(key, promise);
        promise.catch(() => parsed.delete(key));
    }
    return promise;
}

function midiTracks(midi: Midi): { tracks: ScoreTrack[]; notes: ScoreNote[] } {
    const tracks: ScoreTrack[] = [];
    const notes: ScoreNote[] = [];
    midi.tracks.forEach((track, index) => {
        if (!track.notes.length) return;
        const id = `track-${index}`;
        tracks.push({ id, name: track.name || track.instrument.name || `Track ${index + 1}`, instrument: track.instrument.name, color: `hsl(${(index * 61 + 205) % 360} 68% 62%)` });
        track.notes.forEach((note, noteIndex) => notes.push({ id: `midi-${index}-${noteIndex}`, trackId: id, pitch: note.midi, time: note.time, duration: note.duration, velocity: note.velocity }));
    });
    notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch);
    return { tracks, notes };
}

let verovioRuntime: Promise<unknown> | undefined;
async function createVerovioToolkit() {
    const [{ default: createModule }, { VerovioToolkit }] = await Promise.all([import("verovio/wasm"), import("verovio/esm")]);
    verovioRuntime ??= createModule();
    return new VerovioToolkit(await verovioRuntime);
}

async function parseScore(stored: StoredScore): Promise<ParsedScore> {
    const beatClock = (midi: Midi): BeatClockPoint[] => {
        const clock = midi.header.tempos.map(point => ({ time: midi.header.ticksToSeconds(point.ticks), bpm: point.bpm, beats: point.ticks / midi.header.ppq }));
        if (!clock.length || clock[0].time > 0) clock.unshift({ time: 0, bpm: 120, beats: 0 });
        return clock;
    };
    if (stored.format === "midi") {
        const midi = new Midi(stored.data);
        const { tracks, notes } = midiTracks(midi);
        return { format: "midi", name: stored.name, tracks, notes, events: notes.map(note => ({ id: note.id, time: note.time, kind: "note" })), duration: midi.duration, beatClock: beatClock(midi) };
    }
    const toolkit = await createVerovioToolkit();
    try {
        toolkit.setOptions({ inputFrom: "xml", breaks: "none", scale: 40, adjustPageHeight: true, adjustPageWidth: true, pageWidth: 2100, svgViewBox: true });
        const loaded = stored.format === "mxl" ? toolkit.loadZipDataBuffer(stored.data) : toolkit.loadData(new TextDecoder().decode(stored.data));
        if (!loaded) throw new Error("Verovio could not read this MusicXML file.");
        const svg = toolkit.renderToSVG(1);
        const midiBase64 = toolkit.renderToMIDI();
        const midiBytes = Uint8Array.from(atob(midiBase64), char => char.charCodeAt(0));
        const midi = new Midi(midiBytes);
        const { tracks, notes } = midiTracks(midi);
        const events: ScoreEvent[] = [];
        const dom = new DOMParser().parseFromString(svg, "image/svg+xml");
        // Verovio reports 0 for rest positions via getTimeForElement. A rest is
        // not an alignment anchor; treating it as a note makes every rest in a
        // long score point back to the beginning of the audio.
        for (const element of Array.from(dom.querySelectorAll("g.note[id], g.measure[id]"))) {
            const id = element.getAttribute("id");
            if (!id) continue;
            const time = toolkit.getTimeForElement(id) / 1000;
            if (!Number.isFinite(time) || time < 0) continue;
            const kind = element.classList.contains("measure") ? "measure" : "note";
            events.push({ id, time, kind, label: kind === "measure" ? element.getAttribute("n") || undefined : undefined });
        }
        const measureTimes = events.filter(event => event.kind === "measure").map(event => event.time);
        const metadata = inferScoreMetadata(stored.format === "mxl" ? toolkit.getMEI() : new TextDecoder().decode(stored.data), measureTimes, midi.duration, midi.header.tempos.map(point => ({ time: point.time ?? midi.header.ticksToSeconds(point.ticks), bpm: point.bpm })));
        events.sort((a, b) => a.time - b.time || (a.kind === "measure" ? -1 : 1));
        let measureNumber = 0, lastMeasureTime = -Infinity;
        for (const event of events) {
            if (event.kind !== "measure") continue;
            if (event.time - lastMeasureTime > 0.01) { measureNumber++; lastMeasureTime = event.time; }
            event.label ||= String(measureNumber);
        }
        return { format: stored.format, name: stored.name, tracks, notes, events, duration: midi.duration, svg, metadata, beatClock: beatClock(midi) };
    } finally { toolkit.destroy(); }
}
