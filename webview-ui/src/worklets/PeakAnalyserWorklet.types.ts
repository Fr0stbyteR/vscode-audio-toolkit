export interface IPeakAnalyserProcessor {
    getPeak(): number[];
    getPeakSinceLastGet(): number[];
    destroy(): void;
}
export interface IPeakAnalyserNode {}
export type PeakAnalyserParameters = "windowSize";
