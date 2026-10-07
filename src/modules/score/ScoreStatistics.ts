import { audioTimeAtScore } from "./Alignment";
import type { AlignmentPoint } from "./Alignment";
import type { ScoreNote } from "./ScoreLibrary";
import type { StatisticsSource } from "../../core/RangeStatistics";

export function scoreStatisticsSource(notes: ScoreNote[], alignment: AlignmentPoint[], sampleRate: number, hiddenTracks: string[]): StatisticsSource {
    const hidden = new Set(hiddenTracks);
    return { kind: "notes", notes: notes.filter(note => !hidden.has(note.trackId)).map(note => ({
        start: audioTimeAtScore(alignment, note.time) * sampleRate,
        end: audioTimeAtScore(alignment, note.time + note.duration) * sampleRate, pitch: note.pitch
    })) };
}
