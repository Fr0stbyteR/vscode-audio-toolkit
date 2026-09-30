interface Note { pitch: number; time: number; duration: number; velocity: number; }
interface AlignmentPoint { scoreTime: number; audioTime: number; }

function fft(real: Float32Array, imag: Float32Array) {
    const size = real.length;
    for (let index = 1, reversed = 0; index < size; index++) {
        let bit = size >> 1;
        while (reversed & bit) { reversed ^= bit; bit >>= 1; }
        reversed ^= bit;
        if (index < reversed) {
            [real[index], real[reversed]] = [real[reversed], real[index]];
            [imag[index], imag[reversed]] = [imag[reversed], imag[index]];
        }
    }
    for (let length = 2; length <= size; length *= 2) {
        const angle = -2 * Math.PI / length;
        for (let start = 0; start < size; start += length) {
            for (let offset = 0; offset < length / 2; offset++) {
                const c = Math.cos(angle * offset), s = Math.sin(angle * offset);
                const right = start + offset + length / 2, left = start + offset;
                const tr = real[right] * c - imag[right] * s;
                const ti = real[right] * s + imag[right] * c;
                real[right] = real[left] - tr; imag[right] = imag[left] - ti;
                real[left] += tr; imag[left] += ti;
            }
        }
    }
}

function normalizePitchClasses(vector: Float32Array) {
    let norm = 0;
    for (let index = 0; index < 12; index++) norm += vector[index] * vector[index];
    norm = Math.sqrt(norm);
    if (norm > 1e-8) for (let index = 0; index < 12; index++) vector[index] /= norm;
}

function audioChroma(samples: Float32Array, frames: number): Float32Array[] {
    const size = 4096, sampleRate = 11025;
    const output: Float32Array[] = [];
    const real = new Float32Array(size), imag = new Float32Array(size);
    const previous = new Float32Array(12);
    const pitchBins = Array.from({ length: 48 }, (_, index) => Math.round((440 * 2 ** ((index + 48 - 69) / 12)) * size / sampleRate));
    for (let frame = 0; frame < frames; frame++) {
        const center = Math.round(frame * Math.max(0, samples.length - 1) / Math.max(1, frames - 1));
        for (let index = 0; index < size; index++) {
            const sampleIndex = center + index - size / 2;
            real[index] = sampleIndex >= 0 && sampleIndex < samples.length ? samples[sampleIndex] * (0.5 - 0.5 * Math.cos(2 * Math.PI * index / (size - 1))) : 0;
            imag[index] = 0;
        }
        fft(real, imag);
        const vector = new Float32Array(13);
        for (let pitch = 0; pitch < pitchBins.length; pitch++) {
            const bin = pitchBins[pitch];
            let energy = 0;
            for (let offset = -1; offset <= 1; offset++) energy += Math.hypot(real[bin + offset], imag[bin + offset]);
            vector[(pitch + 48) % 12] += Math.sqrt(energy);
        }
        let positiveFlux = 0, energy = 0;
        for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
            positiveFlux += Math.max(0, vector[pitchClass] - previous[pitchClass]);
            energy += vector[pitchClass];
            previous[pitchClass] = vector[pitchClass];
        }
        vector[12] = energy > 1e-8 ? Math.min(1, positiveFlux / energy * 2) : 0;
        normalizePitchClasses(vector);
        output.push(vector);
    }
    return output;
}

function scoreChroma(notes: Note[], frames: number, duration: number): Float32Array[] {
    const output = Array.from({ length: frames }, () => new Float32Array(13));
    for (const note of notes) {
        const start = Math.max(0, Math.floor(note.time / duration * (frames - 1)));
        const end = Math.min(frames - 1, Math.ceil((note.time + Math.max(0.05, note.duration)) / duration * (frames - 1)));
        for (let frame = start; frame <= end; frame++) output[frame][note.pitch % 12] += Math.max(0.3, note.velocity);
        output[start][12] += Math.max(0.3, note.velocity);
    }
    let maximumOnset = 0;
    for (const vector of output) maximumOnset = Math.max(maximumOnset, vector[12]);
    for (const vector of output) {
        normalizePitchClasses(vector);
        if (maximumOnset > 0) vector[12] /= maximumOnset;
    }
    return output;
}

function distance(a: Float32Array, b: Float32Array): number {
    let dot = 0, aEnergy = 0, bEnergy = 0;
    for (let index = 0; index < 12; index++) { dot += a[index] * b[index]; aEnergy += a[index]; bEnergy += b[index]; }
    const chromaDistance = !aEnergy && !bEnergy ? 0.2 : !aEnergy || !bEnergy ? 0.9 : 1 - dot;
    return chromaDistance + Math.abs(a[12] - b[12]) * 0.35;
}

export function dtw(score: Float32Array[], audio: Float32Array[], scoreDuration: number, audioDuration: number): AlignmentPoint[] {
    const rows = score.length, columns = audio.length, stride = columns + 1;
    const costs = new Float32Array((rows + 1) * stride);
    const directions = new Uint8Array((rows + 1) * stride);
    costs.fill(Infinity); costs[0] = 0;
    const band = Math.max(24, Math.ceil(columns * 0.3));
    for (let row = 1; row <= rows; row++) {
        const center = Math.round(row / rows * columns);
        const first = Math.max(1, center - band), last = Math.min(columns, center + band);
        for (let column = first; column <= last; column++) {
            const index = row * stride + column;
            const diagonal = costs[index - stride - 1];
            const above = costs[index - stride] + 0.12;
            const left = costs[index - 1] + 0.12;
            let best = diagonal, direction = 0;
            if (above < best) { best = above; direction = 1; }
            if (left < best) { best = left; direction = 2; }
            costs[index] = distance(score[row - 1], audio[column - 1]) + best;
            directions[index] = direction;
        }
    }
    if (!Number.isFinite(costs[rows * stride + columns])) throw new Error("The alignment path could not be found.");
    const firstColumn = new Float32Array(rows);
    const lastColumn = new Float32Array(rows);
    firstColumn.fill(Infinity);
    lastColumn.fill(-Infinity);
    let row = rows, column = columns;
    while (row > 0 && column > 0) {
        firstColumn[row - 1] = Math.min(firstColumn[row - 1], column - 1);
        lastColumn[row - 1] = Math.max(lastColumn[row - 1], column - 1);
        const direction = directions[row * stride + column];
        if (direction === 0) { row--; column--; }
        else if (direction === 1) row--;
        else column--;
    }
    const correspondence = new Float32Array(rows);
    for (let index = 0; index < rows; index++) {
        // Horizontal DTW steps mean one score frame spans a range of audio frames.
        // Keeping the earliest visited column systematically pulled the score ahead.
        correspondence[index] = Number.isFinite(firstColumn[index])
            ? (firstColumn[index] + lastColumn[index]) / 2
            : index / Math.max(1, rows - 1) * (columns - 1);
        if (index) correspondence[index] = Math.max(correspondence[index - 1], correspondence[index]);
    }
    const points: AlignmentPoint[] = [{ scoreTime: 0, audioTime: 0 }];
    for (let index = 1; index < rows - 1; index += Math.max(1, Math.floor(rows / 500))) {
        points.push({ scoreTime: index / (rows - 1) * scoreDuration, audioTime: correspondence[index] / (columns - 1) * audioDuration });
    }
    points.push({ scoreTime: scoreDuration, audioTime: audioDuration });
    return points;
}

self.onmessage = (event: MessageEvent<{ samples: Float32Array; notes: Note[]; audioDuration: number; scoreDuration: number }>) => {
    try {
        const { samples, notes, audioDuration, scoreDuration } = event.data;
        if (!notes.length || scoreDuration <= 0 || audioDuration <= 0) throw new Error("Both audio and score need note data for alignment.");
        const frames = Math.max(24, Math.min(1200, Math.ceil(audioDuration / 0.25)));
        self.postMessage({ type: "progress", message: "Extracting chroma features" });
        const audio = audioChroma(samples, frames);
        const score = scoreChroma(notes, frames, scoreDuration);
        self.postMessage({ type: "progress", message: "Aligning score and audio" });
        self.postMessage({ type: "result", points: dtw(score, audio, scoreDuration, audioDuration) });
    } catch (reason) {
        self.postMessage({ type: "error", message: reason instanceof Error ? reason.message : String(reason) });
    }
};
