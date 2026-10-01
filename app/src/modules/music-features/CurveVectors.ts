import type { VectorDataSlice } from "../../core/VectorImageProcessor";
import type { CurvePoint } from "./PerformedTempo";

/** One overlaid vector per metric, with exact timestamps and explicit gaps. */
export function curveVectors(points: CurvePoint[], sampleRate: number, channels: number, endIndex: number): VectorDataSlice[][] {
    const samplePositions = Float64Array.from(points.map(point => point.time * sampleRate));
    return Array.from({ length: channels }, (_, channel) => {
        if (!points.length) return [];
        const values = Float32Array.from(points.map(point => point.values[channel] ?? NaN));
        return [{ startIndex: samplePositions[0], endIndex, offsetFromSample: 0, audioSamplesPerSample: 1, vectors: [values], samplePositions,
            // Uniform min/max pyramid is not valid for irregular timestamps.
            resizedVectors: { resizes: [], sizes: [], resizeOptions: { resizeFactor: 4, minWidth: 4 } }
        }];
    });
}
