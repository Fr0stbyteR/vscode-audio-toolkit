import type AudioEditor from "../../core/AudioEditor";
import type { AudioAnalysisResult } from "../../types";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";
import LibrosaMatrixModule, { LibrosaMatrixVisualizationState } from "./LibrosaMatrixModule";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { SIGNAL_STATISTICS_FEATURES, SignalStatisticsFeature } from "./SignalStatisticsCatalog";

type State = LibrosaVisualizationState & { frameLength: number; hopLength: number; silenceThresholdDb: number };
const defaults = (feature: SignalStatisticsFeature) => ({ frameLength: 2048, hopLength: 512, silenceThresholdDb: -60, ...feature.options });
const metadata = (): Record<string, [string, ...unknown[]]> => ({
    name: ["Name"], color: ["Color"],
    frameLength: ["FFT size", 256, 512, 1024, 2048, 4096, 8192],
    hopLength: ["Hop length", 64, 64, 8192],
    silenceThresholdDb: ["Silence threshold (dBFS)", -120, 1, 0],
    splitFrequency: ["Split frequency (Hz)", 20, 10, 20000],
    fmin: ["Minimum frequency (Hz)", 20, 10, 10000], fmax: ["Maximum frequency (Hz)", 100, 100, 20000],
    lpcOrder: ["LPC order", 2, 1, 64], coefficients: ["Coefficients", 1, 1, 64],
    preEmphasis: ["Pre-emphasis", 0, .01, .999], maximumBandwidth: ["Maximum formant bandwidth (Hz)", 50, 50, 5000],
    maxPeaks: ["Maximum spectral peaks", 2, 1, 128], peakThresholdDb: ["Peak threshold (dB relative)", -80, 1, -6],
    smoothingFrames: ["Smoothing frames", 1, 1, 101], modulationWindowSeconds: ["Modulation window (s)", .1, .1, 2],
    referenceLevelDb: ["Digital level reference (dB)", 0, 1, 140],
    colorMap: ["Color map", "inferno", "spectrum", "grayscale"],
    colorMin: ["Color range minimum (0–1)", 0, .01, 1], colorMax: ["Color range maximum (0–1)", 0, .01, 1], opacity: ["Layer opacity", .05, .05, 1]
});

function vectorModule(feature: SignalStatisticsFeature) {
    return class SignalStatisticsVector extends LibrosaVectorModule<State> {
        static MODULE_ID = `librosa.${feature.algorithm.toLowerCase()}`;
        static MODULE_NAME = `${feature.name} (librosa)`;
        static DEFAULT_ANALYSIS_STATE = defaults(feature);
        static DEFAULT_STATE: State = { name: feature.name, color: "#4fc3f7", ...this.DEFAULT_ANALYSIS_STATE };
        readonly unit = feature.unit;
        get channelLabels() { return feature.channels; }
        get analysisHelp() { return feature.help; }
        protected get algorithm() { return feature.algorithm; }
        protected selectVectors(result: AudioAnalysisResult) { return result.vectors!; }
        static async fromAudioData(editor: AudioEditor, initial: Partial<State> = {}) {
            const module = new SignalStatisticsVector(editor, { ...this.DEFAULT_STATE, ...initial });
            void module.calculate();
            return module;
        }
        getOptionsMetadata() { return metadata(); }
    };
}

function matrixModule(feature: SignalStatisticsFeature) {
    type MatrixState = State & LibrosaMatrixVisualizationState;
    return class SignalStatisticsMatrix extends LibrosaMatrixModule<MatrixState> {
        static MODULE_ID = `librosa.${feature.algorithm.toLowerCase()}`;
        static MODULE_NAME = `${feature.name} (librosa)`;
        static DEFAULT_ANALYSIS_STATE = defaults(feature);
        static DEFAULT_STATE: MatrixState = { name: feature.name, color: "#ffffff", colorMap: "inferno", colorMin: .12, colorMax: 1, opacity: 1, ...this.DEFAULT_ANALYSIS_STATE };
        readonly unit = "Coefficient";
        get valueUnit() { return "LPCC"; }
        get binLabels() { return Array.from({ length: this.bins }, (_, index) => `c${index + 1}`); }
        get analysisHelp() { return feature.help; }
        protected get algorithm() { return feature.algorithm; }
        static async fromAudioData(editor: AudioEditor, initial: Partial<MatrixState> = {}) {
            const module = new SignalStatisticsMatrix(editor, { ...this.DEFAULT_STATE, ...initial });
            void module.calculate();
            return module;
        }
        getOptionsMetadata() { return metadata(); }
    };
}

export function getSignalStatisticsModules() {
    return SIGNAL_STATISTICS_FEATURES.map(feature => feature.kind === "matrix" ? matrixModule(feature) : vectorModule(feature));
}
