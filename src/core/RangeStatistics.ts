import type { VectorDataSlice } from "./VectorImageProcessor";
import type { MatrixDataSlice } from "./MatrixImageProcessor";
import type { AudioAnalysisResult } from "../types";

type Metadata = AudioAnalysisResult["metadata"];
export interface StatisticsSummary { count: number; mean?: number; min?: number; max?: number; std?: number; rms?: number }
export interface StatisticsChannel { label: string; unit: string; summary: StatisticsSummary }
export interface StatisticsResult { channels: StatisticsChannel[]; points?: number; regions?: number; coveredSeconds?: number; notes?: number }
export type StatisticsSource =
    | { kind: "vector"; slices: VectorDataSlice[]; unit: string; labels?: string[]; metadata?: Metadata; help?: string }
    | { kind: "matrix"; slices: MatrixDataSlice[]; unit: string; labels?: string[]; binLabels?: string[]; metadata?: Metadata; help?: string }
    | { kind: "markers"; markers: { position: number | [number, number] }[] }
    | { kind: "notes"; notes: { start: number; end: number; pitch: number }[] };

/** A point cursor is not a selection; clamp before deciding the automatic scope. */
export function statisticsRange(selection: [number, number] | null | undefined, length: number) {
    const limit = Math.max(0, Number.isFinite(length) ? length : 0);
    if (selection?.every(Number.isFinite)) {
        const start = Math.max(0, Math.min(limit, Math.min(...selection)));
        const end = Math.max(0, Math.min(limit, Math.max(...selection)));
        if (end > start) return { range: [start, end] as [number, number], selected: true };
    }
    return { range: [0, limit] as [number, number], selected: false };
}

export function formatStatistic(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    if (value !== 0 && (Math.abs(value) >= 100000 || Math.abs(value) < .001)) return value.toExponential(2);
    return Number(value.toFixed(3)).toString();
}

class Accumulator {
    count = 0; mean = 0; m2 = 0; min = Infinity; max = -Infinity;
    add(value: number) {
        if (!Number.isFinite(value)) return;
        const delta = value - this.mean;
        this.mean += delta / ++this.count;
        this.m2 += delta * (value - this.mean);
        this.min = Math.min(this.min, value); this.max = Math.max(this.max, value);
    }
    finish(): StatisticsSummary {
        if (!this.count) return { count: 0 };
        const variance = Math.max(0, this.m2 / this.count);
        return { count: this.count, mean: this.mean, min: this.min, max: this.max,
            std: Math.sqrt(variance), rms: Math.hypot(this.mean, Math.sqrt(variance)) };
    }
}

/** Capability adapter; categorical description badges are not numeric signals. */
export function moduleStatisticsSource(module: { moduleId: string }): StatisticsSource | undefined {
    const data = module as typeof module & { dataSlices?: VectorDataSlice[] | MatrixDataSlice[];
        unit?: string; channelLabels?: string[]; binLabels?: string[]; analysisMetadata?: Metadata; analysisHelp?: string };
    const slices = data.dataSlices;
    if (!slices?.length) return undefined;
    const common = { unit: data.unit ?? (module.moduleId === "waveform" ? "Amplitude" : module.moduleId === "spectrogram" ? "dB" : ""),
        labels: data.channelLabels, metadata: data.analysisMetadata, help: data.analysisHelp };
    if ("vectors" in slices[0]) return { kind: "vector", ...common, slices: slices as VectorDataSlice[] };
    if ("resizedMatrices" in slices[0]) return { kind: "matrix", ...common, slices: slices as MatrixDataSlice[], binLabels: data.binLabels };
    return undefined;
}

function lowerBound(positions: Float64Array, sample: number, inclusive = false) {
    let low = 0, high = positions.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (positions[mid] < sample || (inclusive && positions[mid] === sample)) low = mid + 1; else high = mid;
    }
    return low;
}
function decodeValidity(metadata: Metadata, channel: number): Uint8Array | undefined {
    const encoded = metadata?.[`validity.${channel}`];
    if (typeof encoded !== "string") return undefined;
    try { return Uint8Array.from(atob(encoded), character => character.charCodeAt(0)); }
    catch { return undefined; } // Legacy imports need not contain a bitmap.
}
const isValid = (mask: Uint8Array | undefined, index: number) => !mask || !!(mask[index >>> 3] & (1 << (index & 7)));

/** Population statistics on finite observations, not a time-weighted integral.
 * Yield regularly, without copying raw buffers; obsolete selections are aborted.
 */
export async function calculateRangeStatistics(source: StatisticsSource, range: [number, number], sampleRate: number,
    options: { bin?: number; includeEnd?: boolean; signal?: AbortSignal } = {}): Promise<StatisticsResult> {
    const { signal, includeEnd = false, bin } = options;
    let deadline = performance.now() + 8;
    async function checkpoint() {
        if (signal?.aborted) throw new DOMException("Statistics cancelled", "AbortError");
        if (performance.now() >= deadline) {
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            if (signal?.aborted) throw new DOMException("Statistics cancelled", "AbortError");
            deadline = performance.now() + 8;
        }
    }
    const inRange = (position: number) => position >= range[0] && (position < range[1] || (includeEnd && position === range[1]));
    const accumulators: Accumulator[] = [];
    const accumulator = (index: number) => accumulators[index] ??= new Accumulator();
    const masks = new Map<number, Uint8Array | undefined>();
    const mask = (metadata: Metadata, index: number) => {
        if (!masks.has(index)) masks.set(index, decodeValidity(metadata, index));
        return masks.get(index);
    };
    if (source.kind === "vector") {
        for (const slice of source.slices) {
            if (!(slice.audioSamplesPerSample > 0)) continue;
            const origin = slice.startIndex - slice.offsetFromSample;
            for (let channel = 0; channel < slice.vectors.length; channel++) {
                const vector = slice.vectors[channel], stats = accumulator(channel), valid = mask(source.metadata, channel);
                const first = slice.samplePositions ? lowerBound(slice.samplePositions, range[0]) : Math.max(0, Math.ceil((range[0] - origin) / slice.audioSamplesPerSample));
                const last = Math.min(vector.length, slice.samplePositions ? lowerBound(slice.samplePositions, range[1], includeEnd) : includeEnd ? Math.floor((range[1] - origin) / slice.audioSamplesPerSample) + 1 : Math.ceil((range[1] - origin) / slice.audioSamplesPerSample));
                for (let start = first; start < last; start += 8192) {
                    await checkpoint();
                    for (let i = start; i < Math.min(last, start + 8192); i++) if (isValid(valid, i)) stats.add(vector[i]);
                }
            }
        }
    } else if (source.kind === "matrix") {
        for (const slice of source.slices) {
            // Level zero is original numeric data, never a resized heatmap.
            const original = slice.resizedMatrices.resizes[0];
            if (!original || !(original.audioSamplesPerFrame > 0)) continue;
            const origin = slice.startIndex - original.offsetFromFrame;
            const first = Math.max(0, Math.ceil((range[0] - origin) / original.audioSamplesPerFrame));
            const lastPosition = includeEnd ? Math.floor((range[1] - origin) / original.audioSamplesPerFrame) + 1 : Math.ceil((range[1] - origin) / original.audioSamplesPerFrame);
            for (let channel = 0; channel < original.data.length; channel++) {
                const frames = original.data[channel], stats = accumulator(channel), last = Math.min(frames.length, lastPosition);
                for (let start = first; start < last; start += 16) {
                    await checkpoint();
                    for (let i = start; i < Math.min(last, start + 16); i++) {
                        const row = frames[i], from = bin ?? 0, to = bin === undefined ? row.length : Math.min(row.length, bin + 1);
                        for (let b = from; b < to; b++) if (isValid(mask(source.metadata, b), i)) stats.add(row[b]);
                    }
                }
            }
        }
    } else if (source.kind === "markers") {
        let points = 0;
        const intervals: [number, number][] = [], duration = new Accumulator();
        for (let index = 0; index < source.markers.length; index++) {
            if (index % 8192 === 0) await checkpoint();
            const { position } = source.markers[index];
            if (typeof position === "number") { if (inRange(position)) points++; continue; }
            if (!position.every(Number.isFinite)) continue;
            const start = Math.max(range[0], Math.min(...position)), end = Math.min(range[1], Math.max(...position));
            if (end > start) { intervals.push([start, end]); duration.add((end - start) / sampleRate); }
        }
        intervals.sort((a, b) => a[0] - b[0]);
        let end = range[0], covered = 0;
        for (const interval of intervals) { covered += Math.max(0, interval[1] - Math.max(end, interval[0])); end = Math.max(end, interval[1]); }
        return { points, regions: intervals.length, coveredSeconds: covered / sampleRate,
            channels: intervals.length ? [{ label: "Region duration", unit: "s", summary: duration.finish() }] : [] };
    } else {
        const pitch = new Accumulator(), duration = new Accumulator();
        for (let index = 0; index < source.notes.length; index++) {
            if (index % 8192 === 0) await checkpoint();
            const note = source.notes[index], start = Math.max(range[0], note.start), end = Math.min(range[1], note.end);
            if (end > start && Number.isFinite(note.pitch)) { pitch.add(note.pitch); duration.add((end - start) / sampleRate); }
        }
        return { notes: pitch.count, channels: [
            { label: "Pitch", unit: "MIDI", summary: pitch.finish() }, { label: "Note duration", unit: "s", summary: duration.finish() }
        ] };
    }
    return { channels: accumulators.map((stats, index) => ({
        label: source.labels?.[index] ?? (accumulators.length > 1 ? `${index + 1}` : ""), unit: source.unit, summary: stats.finish()
    })) };
}
