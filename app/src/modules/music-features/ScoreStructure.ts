import type { MusicRegion } from "../../core/MusicMetadata";
import type { ScoreNote } from "../score/ScoreLibrary";

/** Conservative, auditable section candidates from texture/rhythm/pitch changes. */
export function inferScoreStructure(notes: ScoreNote[], measureTimes: number[], duration: number, minimumMeasures = 4): MusicRegion[] {
    const times = [...new Set(measureTimes.filter(time => Number.isFinite(time) && time >= 0 && time < duration))].sort((a, b) => a - b);
    if (!times.length || !notes.length || !Number.isFinite(duration) || duration <= 0) return [];
    if (times.length > 5000) throw new Error("Score has too many measures for structure inference");
    const minimum = Math.max(2, Math.floor(minimumMeasures));
    const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
    let noteIndex = 0;
    const melodies: number[][] = [], rhythms: number[][] = [];
    const features = times.map((start, index) => {
        const end = times[index + 1] ?? duration, active: ScoreNote[] = [];
        while (noteIndex < sortedNotes.length && sortedNotes[noteIndex].time < start) noteIndex++;
        while (noteIndex < sortedNotes.length && sortedNotes[noteIndex].time < end) active.push(sortedNotes[noteIndex++]);
        const vector = Array<number>(15).fill(0);
        // Preserve ordered upper-voice pitches and onset rhythm, not merely a
        // pitch histogram (different themes frequently share that histogram).
        const melody = Array<number>(8).fill(-1), rhythm = Array<number>(8).fill(0);
        for (const note of active) {
            const bin = Math.min(7, Math.floor((note.time - start) / Math.max(.01, end - start) * 8));
            rhythm[bin]++;
            for (let beat = bin; beat < 8 && start + (beat + .5) / 8 * (end - start) < note.time + note.duration; beat++) melody[beat] = Math.max(melody[beat], note.pitch);
        }
        melodies.push(melody); rhythms.push(rhythm.map(value => Math.min(1, value / 4)));
        for (const note of active) vector[(note.pitch % 12 + 12) % 12] += Math.max(.01, Math.min(note.duration, end - note.time));
        const total = vector.slice(0, 12).reduce((sum, value) => sum + value, 0);
        for (let pitch = 0; pitch < 12; pitch++) vector[pitch] /= total || 1;
        vector[12] = Math.log1p(active.length / Math.max(.01, end - start)) / 4;
        vector[13] = active.reduce((sum, note) => sum + note.pitch, 0) / Math.max(1, active.length) / 127;
        vector[14] = Math.min(1, total / Math.max(.01, end - start) / 4);
        return vector;
    });
    const average = (from: number, to: number) => features.slice(from, to).reduce((sum, feature) => sum.map((value, index) => value + feature[index] / Math.max(1, to - from)), Array<number>(15).fill(0));
    const distance = (a: number[], b: number[]) => Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
    const barDistance = (a: number, b: number, shift = 0) => {
        let pitch = 0, contour = 0, intervals = 0;
        for (let bin = 0; bin < 8; bin++) {
            const left = melodies[a][bin], right = melodies[b][bin];
            pitch += left < 0 || right < 0 ? Number(left !== right) : Math.min(1, Math.abs(left + shift - right) / 12);
            if (bin && left >= 0 && right >= 0 && melodies[a][bin - 1] >= 0 && melodies[b][bin - 1] >= 0) {
                intervals++;
                contour += Number(Math.sign(left - melodies[a][bin - 1]) !== Math.sign(right - melodies[b][bin - 1]));
            }
        }
        const rhythm = rhythms[a].reduce((sum, value, bin) => sum + Math.abs(value - rhythms[b][bin]), 0) / 8;
        return pitch / 8 * .6 + rhythm * .25 + contour / Math.max(1, intervals) * .15;
    };
    const novelty = features.map((_, index) => index < minimum || index > features.length - minimum ? 0 : distance(average(index - minimum, index), average(index, index + minimum)));
    const sorted = novelty.filter(value => value > 0).sort((a, b) => a - b);
    const threshold = Math.max(.24, (sorted[Math.floor(sorted.length * .75)] ?? 1) * 1.2);
    const candidates = novelty.map((value, index) => ({ value, index })).filter(({ value, index }) => value >= threshold && value >= (novelty[index - 1] ?? 0) && value > (novelty[index + 1] ?? 0)).sort((a, b) => b.value - a.value);
    const boundaries = [0, times.length];
    const phraseReturns: { index: number; reference: number; score: number; shift: number }[] = [];
    // Long, near-exact repeated passages are stronger boundary evidence than
    // a local texture change. Detect the entire ordered run, not isolated bars.
    const repeats: { from: number; other: number; length: number }[] = [];
    if (times.length <= 1500) for (let lag = minimum * 2; lag < times.length; lag++) {
        let first = -1;
        for (let bar = 0; bar <= times.length - lag; bar++) {
            const matches = bar < times.length - lag && barDistance(bar, bar + lag) < .045 && distance(features[bar], features[bar + lag]) < .08;
            if (matches && first < 0) first = bar;
            if (!matches && first >= 0) {
                const length = Math.min(lag, bar - first);
                if (length >= minimum * 2) repeats.push({ from: first, other: first + lag, length });
                first = -1;
            }
        }
    }
    for (const repeat of repeats.sort((a, b) => b.length - a.length).slice(0, 8)) for (const index of [repeat.from, repeat.other, repeat.from + repeat.length, repeat.other + repeat.length]) {
        if (boundaries.every(previous => Math.abs(index - previous) >= minimum)) boundaries.push(index);
    }
    for (const candidate of candidates) if (boundaries.length < 128 && boundaries.every(index => Math.abs(candidate.index - index) >= minimum)) boundaries.push(candidate.index);
    // A transposed theme can return without a texture or pitch-histogram
    // novelty peak (e.g. a recapitulation). Find distinctive phrase openings
    // across the score, requiring several ordered bars, not a single motif.
    if (times.length <= 1500) {
        const phraseLength = Math.max(4, minimum * 2);
        const themes = [0, ...candidates.slice(0, 7).map(candidate => candidate.index)].filter(from => from + phraseLength <= times.length && new Set(melodies.slice(from, from + phraseLength).flat().filter(pitch => pitch >= 0)).size >= 5);
        for (const from of themes) {
            const referencePitch = melodies[from].find(pitch => pitch >= 0);
            if (referencePitch === undefined) continue;
            const scores = times.map((_, index) => {
                if (Math.abs(index - from) < phraseLength || index + phraseLength > times.length) return 1;
                const pitch = melodies[index].find(pitch => pitch >= 0);
                if (pitch === undefined) return 1;
                const shift = referencePitch - pitch;
                return Array.from({ length: phraseLength }, (_, bar) => barDistance(index + bar, from + bar, shift)).reduce((sum, value) => sum + value, 0) / phraseLength;
            });
            scores.forEach((score, index) => { if (score < .065 && score < (scores[index - 1] ?? 1) && score <= (scores[index + 1] ?? 1)) phraseReturns.push({ index, reference: from, score, shift: referencePitch - melodies[index].find(pitch => pitch >= 0)! }); });
        }
        for (const { index } of phraseReturns.sort((a, b) => a.score - b.score)) if (boundaries.length < 128 && boundaries.every(previous => Math.abs(index - previous) >= minimum)) boundaries.push(index);
    }
    boundaries.sort((a, b) => a - b);
    const prototypes: { from: number; to: number; feature: number[] }[] = [];
    const sequenceDistance = (from: number, to: number, previous: { from: number; to: number }, shift = 0) => {
        const size = Math.min(48, Math.max(to - from, previous.to - previous.from));
        let total = 0;
        for (let index = 0; index < size; index++) total += barDistance(from + Math.floor(index / size * (to - from)), previous.from + Math.floor(index / size * (previous.to - previous.from)), shift);
        // Require a matching beginning as well as the entire passage. A few
        // matching scales late in a section do not establish theme recurrence.
        return total / size * .7 + barDistance(from, previous.from, shift) * .3;
    };
    const regions: MusicRegion[] = [];
    for (let index = 0; index < boundaries.length - 1; index++) {
        const from = boundaries[index], to = boundaries[index + 1], feature = average(from, to);
        let group = -1, variant = false, best = .16;
        prototypes.forEach((previous, candidate) => {
            const ratio = (to - from) / (previous.to - previous.from);
            if (ratio < .65 || ratio > 1.55) return;
            const score = sequenceDistance(from, to, previous);
            if (score < best && distance(feature, previous.feature) < .28) { best = score; group = candidate; variant = false; }
            const pitch = melodies[from].find(value => value >= 0), oldPitch = melodies[previous.from].find(value => value >= 0);
            const distinctPitches = new Set(melodies.slice(previous.from, previous.to).flat().filter(value => value >= 0)).size;
            // A static note transposed is not evidence of a recurring theme.
            if (distinctPitches >= 4 && pitch !== undefined && oldPitch !== undefined && pitch !== oldPitch) {
                const transposed = sequenceDistance(from, to, previous, oldPitch - pitch);
                if (transposed < Math.min(.10, best)) { best = transposed; group = candidate; variant = true; }
            }
            const opening = phraseReturns.find(match => match.index === from && match.reference === previous.from);
            if (opening) {
                const whole = sequenceDistance(from, to, previous, opening.shift);
                const weighted = opening.score * .7 + whole * .3;
                // A strong multi-bar theme return tolerates a different ending,
                // but still rejects a passage whose remainder is unrelated.
                const endingTolerance = .28 + Math.abs(Math.log(ratio)) * .12;
                if (whole < endingTolerance && weighted < Math.min(.11, best)) { best = weighted; group = candidate; variant = opening.shift !== 0; }
            }
        });
        if (group < 0) { group = prototypes.length; prototypes.push({ from, to, feature }); }
        const label = `${String.fromCharCode(65 + group % 26)}${group >= 26 ? Math.floor(group / 26) : ""}${variant ? "′" : ""}`;
        const previous = regions.at(-1);
        if (previous?.label === label) previous.end = times[to] ?? duration;
        else regions.push({ id: `structure-${from}`, start: times[from], end: times[to] ?? duration, label });
    }
    return regions;
}
