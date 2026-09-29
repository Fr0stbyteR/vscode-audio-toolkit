import { ScoreNote } from "./ScoreLibrary";

export interface AlignmentPoint { scoreTime: number; audioTime: number; }

export function interpolate(points: AlignmentPoint[], time: number, source: "scoreTime" | "audioTime", target: "scoreTime" | "audioTime"): number {
    if (!points.length) return 0;
    if (time <= points[0][source]) return points[0][target];
    const last = points[points.length - 1];
    if (time >= last[source]) return last[target];
    let low = 0, high = points.length - 1;
    while (high - low > 1) {
        const mid = (low + high) >>> 1;
        if (points[mid][source] <= time) low = mid; else high = mid;
    }
    const a = points[low], b = points[high];
    const fraction = (time - a[source]) / Math.max(1e-9, b[source] - a[source]);
    return a[target] + fraction * (b[target] - a[target]);
}

export function alignmentPoints(auto: AlignmentPoint[], manual: AlignmentPoint[], scoreDuration: number, audioDuration: number): AlignmentPoint[] {
    const base = auto.length > 1 ? auto : [{ scoreTime: 0, audioTime: 0 }, { scoreTime: scoreDuration, audioTime: audioDuration }];
    if (!manual.length) return base;
    const sortedManual = [...manual].sort((a, b) => a.scoreTime - b.scoreTime);
    const controls = [
        { scoreTime: 0, audioTime: -interpolate(base, 0, "scoreTime", "audioTime") },
        ...sortedManual.map(point => ({ scoreTime: point.scoreTime, audioTime: point.audioTime - interpolate(base, point.scoreTime, "scoreTime", "audioTime") })),
        { scoreTime: scoreDuration, audioTime: audioDuration - interpolate(base, scoreDuration, "scoreTime", "audioTime") }
    ];
    const corrected = [...base, ...sortedManual].sort((a, b) => a.scoreTime - b.scoreTime).map(point => ({
        scoreTime: point.scoreTime,
        audioTime: Math.max(0, Math.min(audioDuration, interpolate(base, point.scoreTime, "scoreTime", "audioTime") + interpolate(controls, point.scoreTime, "scoreTime", "audioTime")))
    }));
    corrected[0].audioTime = 0;
    for (let index = 1; index < corrected.length; index++) corrected[index].audioTime = Math.max(corrected[index - 1].audioTime, corrected[index].audioTime);
    corrected[corrected.length - 1].audioTime = audioDuration;
    return corrected;
}

export function scoreTimeAtAudio(points: AlignmentPoint[], audioTime: number): number {
    return interpolate(points, audioTime, "audioTime", "scoreTime");
}

export function audioTimeAtScore(points: AlignmentPoint[], scoreTime: number): number {
    return interpolate(points, scoreTime, "scoreTime", "audioTime");
}

export function prepareAudioSamples(channels: Float32Array[], sourceRate: number, targetRate = 11025): Float32Array {
    const length = Math.ceil(channels[0].length * targetRate / sourceRate);
    const output = new Float32Array(length);
    const count = Math.min(channels.length, 2);
    for (let index = 0; index < length; index++) {
        const position = index * sourceRate / targetRate;
        const left = Math.min(channels[0].length - 1, Math.floor(position));
        const right = Math.min(channels[0].length - 1, left + 1);
        const fraction = position - left;
        for (let channel = 0; channel < count; channel++) output[index] += (channels[channel][left] * (1 - fraction) + channels[channel][right] * fraction) / count;
    }
    return output;
}

export function alignScoreToAudio(samples: Float32Array, notes: ScoreNote[], audioDuration: number, scoreDuration: number, onProgress?: (message: string) => void): Promise<AlignmentPoint[]> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./alignment.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = event => {
            if (event.data?.type === "progress") onProgress?.(event.data.message);
            if (event.data?.type === "result") { worker.terminate(); resolve(event.data.points); }
            if (event.data?.type === "error") { worker.terminate(); reject(new Error(event.data.message)); }
        };
        worker.onerror = event => { worker.terminate(); reject(new Error(event.message || "Alignment worker failed")); };
        worker.postMessage({ samples, notes: notes.map(({ pitch, time, duration, velocity }) => ({ pitch, time, duration, velocity })), audioDuration, scoreDuration }, [samples.buffer]);
    });
}
