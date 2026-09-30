export type AudioUnit = "time" | "sample" | "measure";

export interface AudioEditorConfiguration {
    audioUnit: AudioUnit;
    fftSize: number;
    fftOverlap: number;
    fftWindowFunction: string;
    beatsPerMinute: number;
    beatsPerMeasure: number;
    division: number;
    matrixRenderer: "auto" | "webgl" | "canvas2d";
}

export type AudioToolkitModulesState = {
    moduleId: string;
    moduleName: string;
    visible: boolean | number;
    lastVisibleHeight?: number;
    state: AudioToolkitModuleState;
}[];

export interface AudioToolkitModuleState {
    name: string;
    overlayOpacity?: number;
    referenceOverlay?: "none" | "waveform" | "spectrogram";
    referenceOpacity?: number;
}

export type AudioAnalysisAlgorithm =
    | "beats" | "onsets" | "nonSilent"
    | "rms" | "zeroCrossingRate" | "onsetStrength"
    | "spectralCentroid" | "spectralBandwidth" | "spectralRolloff" | "spectralFlatness"
    | "pitch" | "melSpectrogram" | "chroma" | "mfcc";

export interface AudioAnalysisRequest {
    algorithm: AudioAnalysisAlgorithm;
    options?: Record<string, string | number | boolean | null>;
    cachePolicy?: "use" | "refresh";
}

export interface AudioAnalysisCacheInfo {
    status: "hit" | "miss" | "refresh" | "disabled" | "unavailable";
    createdAt?: string;
}

export interface AudioAnalysisResult {
    algorithm: AudioAnalysisAlgorithm;
    sampleRate: number;
    duration: number;
    values?: number[];
    vectors?: (number[] | Float32Array)[];
    matrix?: (number[] | Float32Array)[];
    intervals?: [number, number][];
    metadata?: Record<string, string | number | boolean | null>;
    cache?: AudioAnalysisCacheInfo;
}
