export type AudioUnit = "time" | "sample" | "measure";

export interface AudioEditorConfiguration {
    playbackFollow?: "page" | "scroll";
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
    | "pitch" | "melSpectrogram" | "chroma" | "mfcc"
    | "energy" | "loudness" | "spectralCrest" | "spectralFlux" | "spectralEntropy"
    | "spectralComplexity" | "hfc" | "spectralSpread" | "spectralSkewness" | "spectralKurtosis"
    | "dissonance" | "pitchConfidence" | "melBands" | "barkBands" | "erbBands" | "gfcc" | "hpcp"
    | "silenceRegions" | "pitchNotes" | "keyRegions"
    | "tfInstrument" | "tfInstrumentCurve" | "tfInstrumentRegions"
    | "tfMoodTheme" | "tfMoodThemeCurve" | "tfGenre" | "tfTimbre"
    | "tfVoice" | "tfAcoustic" | "tfElectronic" | "tfTonal" | "tfDanceability"
    | "tfHappy" | "tfSad" | "tfRelaxed" | "tfAggressive" | "tfParty"
    | "tfTags" | "tfTagsCurve" | "tfTempo" | "tfTempoCandidates";

export interface AudioAnalysisRequest {
    engine?: "librosa" | "essentia" | "essentia-tf";
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
    labels?: string[];
    metadata?: Record<string, string | number | boolean | null>;
    cache?: AudioAnalysisCacheInfo;
}
