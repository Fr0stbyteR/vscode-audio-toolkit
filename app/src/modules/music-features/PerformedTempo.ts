import type { AlignmentPoint } from "../score/Alignment";

export interface BeatClockPoint { time: number; bpm: number; beats: number; }
export interface CurvePoint { time: number; values: Array<number | null>; }

/** MIDI ticks establish a quarter-note clock, independently of the encoded tempo. */
export function beatsAtScoreTime(clock: BeatClockPoint[], time: number): number {
    let low = 0, high = clock.length;
    while (low < high) { const mid = (low + high) >>> 1; if (clock[mid].time <= time) low = mid + 1; else high = mid; }
    const point = clock[Math.max(0, low - 1)];
    return point ? point.beats + (time - point.time) * point.bpm / 60 : time * 2;
}

/** Measured tempo, not a duration-ratio fallback. Plateaus stay gaps, not zero BPM. */
export function performedTempo(alignment: AlignmentPoint[], clock: BeatClockPoint[], windowSeconds = 3, hopSeconds = .5): CurvePoint[] {
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0 || !Number.isFinite(hopSeconds) || hopSeconds <= 0) throw new Error("Invalid tempo window / hop");
    const points = alignment.filter(point => Number.isFinite(point.audioTime) && Number.isFinite(point.scoreTime));
    if (points.length < 2 || points.some((point, index) => index > 0 && (point.audioTime < points[index - 1].audioTime || point.scoreTime < points[index - 1].scoreTime))) return [];
    const start = points[0].audioTime, end = points.at(-1)!.audioTime;
    if (end <= start || (end - start) / hopSeconds > 50000) throw new Error("Tempo curve exceeds the sampling limit");
    const beat = (time: number) => {
        // Binary search avoids O(audio samples × DTW path length).
        let low = 0, high = points.length - 1;
        while (high - low > 1) { const mid = (low + high) >>> 1; if (points[mid].audioTime <= time) low = mid; else high = mid; }
        const a = points[low], b = points[high];
        const span = b.audioTime - a.audioTime;
        return beatsAtScoreTime(clock, a.scoreTime + (span > 0 ? Math.max(0, Math.min(1, (time - a.audioTime) / span)) : 0) * (b.scoreTime - a.scoreTime));
    };
    const result: CurvePoint[] = [];
    for (let time = start; time <= end + 1e-8; time += hopSeconds) {
        const left = Math.max(start, time - windowSeconds / 2), right = Math.min(end, time + windowSeconds / 2);
        const bpm = 60 * (beat(right) - beat(left)) / (right - left);
        result.push({ time: Math.round(time * 1000) / 1000, values: [Number.isFinite(bpm) && bpm >= 10 && bpm <= 600 ? bpm : null] });
    }
    return result;
}
