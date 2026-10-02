export interface ScoreRecognitionProgress { progress: number | null; message: string; }
export interface ScoreRecognitionResult { musicxml: string; name: string; pageCount: number; warnings: string[]; cached: boolean; }
export type CurveProgress = (result: import("./AudioEditor").SemanticCurveResult, total: number) => void;
