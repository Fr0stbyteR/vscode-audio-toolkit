
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

export type AudioToolkitModulesState = { moduleId: string, moduleName: string; visible: boolean | number; state: AudioToolkitModuleState }[];

export interface AudioToolkitModuleState {
    name: string;
    // [key: string]: any;
}

export interface AudioToolkitEdit {
    modulesState: AudioToolkitModulesState;
}

export type AudioAnalysisAlgorithm = "beats" | "onsets" | "nonSilent" | "rms" | "spectralCentroid" | "pitch" | "melSpectrogram" | "chroma";

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
    vectors?: number[][];
    matrix?: number[][];
    intervals?: [number, number][];
    metadata?: Record<string, string | number | boolean | null>;
    cache?: AudioAnalysisCacheInfo;
}

export interface IVSCodeAudioEditorHost {
    ready(): void;
    makeEditModulesState(edit: AudioToolkitEdit): void;
    runAnalysis(request: AudioAnalysisRequest): Promise<AudioAnalysisResult>;
}

export interface IVSCodeAudioEditorWebview {
    init(documentInfo: { data?: Uint8Array; uri?: string; workspaceUri?: string; editable?: boolean }, configuration: AudioEditorConfiguration, modulesState: AudioToolkitModulesState | null): Promise<number>;
    updateConfigurationFromHost(configuration: AudioEditorConfiguration): void;
    updateModulesStateFromHost(modulesState: AudioToolkitModulesState | null): void;
    playOrStop(): void;
    pauseOrResume(): void;
}
