export interface MoodRequest { windowSeconds: number; hopSeconds: number; timelineDurationSeconds: number; cachePolicy: "use" | "refresh"; }
export interface MoodResult {
    model: string;
    scale: "normalized-minus-one-to-one";
    points: Array<{ timeSeconds: number; valence: number; arousal: number }>;
    cached: boolean;
}
