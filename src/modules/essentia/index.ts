import AudioEditor from "../../core/AudioEditor";
import type { AudioAnalysisResult } from "../../types";
import type { AudioMarker } from "../../components/ModuleUsingMarker";
import LibrosaVectorModule from "../librosa/LibrosaVectorModule";
import LibrosaMatrixModule, { LibrosaMatrixVisualizationState } from "../librosa/LibrosaMatrixModule";
import LibrosaMarkerModule, { LibrosaMarkerState } from "../librosa/LibrosaMarkerModule";
import { LibrosaVisualizationState } from "../librosa/LibrosaAnalysisModule";
import { ESSENTIA_FEATURES, EssentiaFeature } from "./catalog";
import { getTensorflowModules } from "./tensorflow";

interface FeatureState extends LibrosaVisualizationState { frameLength: number; hopLength: number; sampleRate: number; }
const defaults = (feature: EssentiaFeature) => ({ frameLength: 2048, hopLength: 512, sampleRate: 44100, ...feature.options });
const metadata = (feature: EssentiaFeature): Record<string, [string, ...unknown[]]> => ({
    name: ["Name"], color: ["Color"], data: ["Markers"],
    frameLength: ["FFT size", 256, 512, 1024, 2048, 4096, 8192],
    hopLength: ["Hop length", 64, 64, 8192], sampleRate: ["Analysis sample rate", 16000, 22050, 44100, 48000, 96000],
    bands: ["Bands", 12, 1, feature.algorithm === "barkBands" ? 28 : 128], coefficients: ["Coefficients", 1, 1, 64],
    rollPercent: ["Rolloff fraction", .1, .01, 1], thresholdDb: ["Silence threshold (dBFS)", -120, 1, 0],
    minimumDuration: ["Minimum region duration (s)", .01, .01, 10], confidence: ["Minimum confidence", 0, .05, 1],
    keyWindow: ["Key context window (s)", 2, 1, 60], tuning: ["Reference pitch A4 (Hz)", 400, 1, 480],
    colorMap: ["Color map", "inferno", "spectrum", "grayscale"],
    colorMin: ["Color range minimum (0–1)", 0, .01, 1], colorMax: ["Color range maximum (0–1)", 0, .01, 1], opacity: ["Layer opacity", .05, .05, 1]
});

function vectorModule(feature: EssentiaFeature) {
    return class EssentiaVector extends LibrosaVectorModule<FeatureState> {
        static MODULE_ID = `essentia.${feature.algorithm}`;
        static MODULE_NAME = `${feature.name} (Essentia)`;
        static ANALYSIS_ENGINE = "essentia" as const;
        static DEFAULT_ANALYSIS_STATE = defaults(feature);
        static DEFAULT_STATE: FeatureState = { name: feature.name, color: "#4fc3f7", ...this.DEFAULT_ANALYSIS_STATE };
        readonly unit = feature.unit;
        protected get algorithm() { return feature.algorithm; }
        static async fromAudioData(editor: AudioEditor, initial: Partial<FeatureState> = {}) {
            const module = new EssentiaVector(editor, { ...this.DEFAULT_STATE, ...initial });
            void module.calculate(); return module;
        }
        getOptionsMetadata() { return metadata(feature); }
    };
}

function matrixModule(feature: EssentiaFeature) {
    type State = FeatureState & LibrosaMatrixVisualizationState;
    return class EssentiaMatrix extends LibrosaMatrixModule<State> {
        static MODULE_ID = `essentia.${feature.algorithm}`;
        static MODULE_NAME = `${feature.name} (Essentia)`;
        static ANALYSIS_ENGINE = "essentia" as const;
        static DEFAULT_ANALYSIS_STATE = defaults(feature);
        static DEFAULT_STATE: State = { name: feature.name, color: "#ffffff", colorMap: "inferno", colorMin: .12, colorMax: 1, opacity: 1, ...this.DEFAULT_ANALYSIS_STATE };
        readonly unit = feature.unit;
        get valueUnit() { return feature.valueUnit ?? this.unit; }
        get binLabels() { return feature.algorithm === "hpcp" ? ["A", "A♯", "B", "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯"] : undefined; }
        protected get algorithm() { return feature.algorithm; }
        static async fromAudioData(editor: AudioEditor, initial: Partial<State> = {}) {
            const module = new EssentiaMatrix(editor, { ...this.DEFAULT_STATE, ...initial });
            void module.calculate(); return module;
        }
        getOptionsMetadata() { return metadata(feature); }
    };
}

function markerModule(feature: EssentiaFeature) {
    type State = FeatureState & LibrosaMarkerState;
    return class EssentiaMarker extends LibrosaMarkerModule<State> {
        static MODULE_ID = `essentia.${feature.algorithm}`;
        static MODULE_NAME = `${feature.name} (Essentia)`;
        static ANALYSIS_ENGINE = "essentia" as const;
        static DEFAULT_ANALYSIS_STATE = defaults(feature);
        static DEFAULT_STATE: State = { name: feature.name, color: "#ff8a65", ...this.DEFAULT_ANALYSIS_STATE };
        protected get algorithm() { return feature.algorithm; }
        static async fromAudioData(editor: AudioEditor, initial: Partial<State> = {}) {
            const module = new EssentiaMarker(editor, { ...this.DEFAULT_STATE, ...initial });
            if (!module.state.data) void module.calculate(); return module;
        }
        protected createMarkers(result: AudioAnalysisResult): AudioMarker[] {
            const toSample = (time: number) => Math.round(Math.max(0, Math.min(this.audioEditor.length, time / result.duration * this.audioEditor.length)));
            if (feature.algorithm === "onsets") return (result.values ?? []).map(time => ({ position: toSample(time), name: "", color: this.state.color }));
            return (result.intervals ?? []).map(([start, end], index) => ({ position: [toSample(start), toSample(end)], name: result.labels?.[index] ?? "", color: this.state.color }));
        }
        getOptionsMetadata() { return metadata(feature); }
    };
}

export default async function getEssentiaModules() {
    return [...ESSENTIA_FEATURES.map(feature => feature.kind === "vector" ? vectorModule(feature) : feature.kind === "matrix" ? matrixModule(feature) : markerModule(feature)), ...getTensorflowModules()];
}
