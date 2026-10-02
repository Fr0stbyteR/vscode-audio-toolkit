import AudioEditor from "../../core/AudioEditor";
import type { AudioAnalysisAlgorithm, AudioAnalysisResult } from "../../types";
import type { AudioMarker } from "../../components/ModuleUsingMarker";
import LibrosaVectorModule from "../librosa/LibrosaVectorModule";
import LibrosaMatrixModule, { LibrosaMatrixVisualizationState } from "../librosa/LibrosaMatrixModule";
import LibrosaMarkerModule, { LibrosaMarkerState } from "../librosa/LibrosaMarkerModule";
import type { LibrosaVisualizationState } from "../librosa/LibrosaAnalysisModule";

interface TFState extends LibrosaVisualizationState { hopSeconds: number; label?: string; threshold?: number; minimumDuration?: number; classLabels?: string[]; }
interface Feature { algorithm: AudioAnalysisAlgorithm; name: string; kind: "vector" | "matrix" | "marker"; label?: string; }
export const TF_FEATURES: Feature[] = [
    { algorithm: "tfInstrument", name: "Instrument distribution", kind: "matrix" },
    { algorithm: "tfInstrumentCurve", name: "Instrument relevance", kind: "vector", label: "piano" },
    { algorithm: "tfInstrumentRegions", name: "Instrument regions · candidates", kind: "marker", label: "piano" },
    { algorithm: "tfMoodTheme", name: "Mood and theme", kind: "matrix" },
    { algorithm: "tfMoodThemeCurve", name: "Mood and theme relevance", kind: "vector", label: "calm" },
    { algorithm: "tfGenre", name: "Genre distribution", kind: "matrix" },
    { algorithm: "tfTimbre", name: "Timbre brightness", kind: "vector" },
    { algorithm: "tfVoice", name: "Voice presence", kind: "vector" },
    { algorithm: "tfAcoustic", name: "Acoustic character", kind: "vector" },
    { algorithm: "tfElectronic", name: "Electronic character", kind: "vector" },
    { algorithm: "tfTonal", name: "Tonal character", kind: "vector" },
    { algorithm: "tfDanceability", name: "Danceability", kind: "vector" },
    { algorithm: "tfHappy", name: "Happy mood", kind: "vector" },
    { algorithm: "tfSad", name: "Sad mood", kind: "vector" },
    { algorithm: "tfRelaxed", name: "Relaxed mood", kind: "vector" },
    { algorithm: "tfAggressive", name: "Aggressive mood", kind: "vector" },
    { algorithm: "tfParty", name: "Party character", kind: "vector" },
    { algorithm: "tfTags", name: "Music auto-tags", kind: "matrix" },
    { algorithm: "tfTagsCurve", name: "Music tag relevance", kind: "vector", label: "instrumental" },
    { algorithm: "tfTempo", name: "Tempo · audio estimate", kind: "vector" },
    { algorithm: "tfTempoCandidates", name: "Tempo candidates", kind: "matrix" }
];

function classes(result: AudioAnalysisResult): string[] {
    try { const labels = JSON.parse(String(result.metadata?.classLabels ?? "[]")); return Array.isArray(labels) ? labels.filter(label => typeof label === "string") : []; }
    catch { return []; }
}
const defaults = (feature: Feature) => ({ hopSeconds: feature.algorithm.startsWith("tfTempo") ? 6 : 2,
    ...(feature.label ? { label: feature.label } : {}),
    ...(feature.kind === "marker" ? { threshold: .6, minimumDuration: 2 } : {}) });
function metadata(labels: string[], feature: Feature): Record<string, [string, ...unknown[]]> {
    return {
        name: ["Name"], color: ["Color"], data: ["Markers"], hopSeconds: ["Prediction interval (s)", 1, .5, 30],
        label: ["Target label", ...new Set([...(feature.label ? [feature.label] : []), ...labels])],
        threshold: ["Candidate score threshold", 0, .05, 1], minimumDuration: ["Minimum region duration (s)", .1, .1, 60],
        colorMap: ["Color map", "inferno", "spectrum", "grayscale"],
        colorMin: ["Color range minimum (0–1)", 0, .01, 1], colorMax: ["Color range maximum (0–1)", 0, .01, 1], opacity: ["Layer opacity", .05, .05, 1]
    };
}
function vector(feature: Feature) {
    return class TensorflowVector extends LibrosaVectorModule<TFState> {
        static MODULE_ID = `essentia.${feature.algorithm}`;
        static MODULE_NAME = `${feature.name} (Essentia TF)`;
        static ANALYSIS_ENGINE = "essentia-tf" as const;
        static DEFAULT_ANALYSIS_STATE = defaults(feature);
        static DEFAULT_STATE: TFState = { name: feature.name, color: "#4fc3f7", ...this.DEFAULT_ANALYSIS_STATE };
        private labels: string[] = [];
        readonly unit = feature.algorithm === "tfTempo" ? "BPM" : "Score";
        protected get algorithm() { return feature.algorithm; }
        protected consumeResult(result: AudioAnalysisResult) { this.labels = classes(result); super.consumeResult(result); }
        getOptionsMetadata() { return metadata(this.labels, feature); }
        static async fromAudioData(editor: AudioEditor, initial: Partial<TFState> = {}) {
            const module = new TensorflowVector(editor, { ...this.DEFAULT_STATE, ...initial }); void module.calculate(); return module;
        }
    };
}
function matrix(feature: Feature) {
    type State = TFState & LibrosaMatrixVisualizationState;
    return class TensorflowMatrix extends LibrosaMatrixModule<State> {
        static MODULE_ID = `essentia.${feature.algorithm}`;
        static MODULE_NAME = `${feature.name} (Essentia TF)`;
        static ANALYSIS_ENGINE = "essentia-tf" as const;
        static DEFAULT_ANALYSIS_STATE = defaults(feature);
        static DEFAULT_STATE: State = { name: feature.name, color: "#ffffff", colorMap: "inferno", colorMin: .05, colorMax: 1, opacity: 1, ...this.DEFAULT_ANALYSIS_STATE };
        private labels: string[] = [];
        readonly unit = feature.algorithm === "tfTempoCandidates" ? "BPM" : "Label";
        get valueUnit() { return "Score"; }
        get binLabels() { return this.labels; }
        protected get algorithm() { return feature.algorithm; }
        protected consumeResult(result: AudioAnalysisResult) { this.labels = result.labels ?? classes(result); super.consumeResult(result); }
        getOptionsMetadata() { return metadata(this.labels, feature); }
        static async fromAudioData(editor: AudioEditor, initial: Partial<State> = {}) {
            const module = new TensorflowMatrix(editor, { ...this.DEFAULT_STATE, ...initial }); void module.calculate(); return module;
        }
    };
}
function marker(feature: Feature) {
    type State = TFState & LibrosaMarkerState;
    return class TensorflowMarker extends LibrosaMarkerModule<State> {
        static MODULE_ID = `essentia.${feature.algorithm}`;
        static MODULE_NAME = `${feature.name} (Essentia TF)`;
        static ANALYSIS_ENGINE = "essentia-tf" as const;
        static DEFAULT_ANALYSIS_STATE = defaults(feature);
        static DEFAULT_STATE: State = { name: feature.name, color: "#ff8a65", ...this.DEFAULT_ANALYSIS_STATE };
        private labels: string[] = [];
        protected get algorithm() { return feature.algorithm; }
        protected createMarkers(result: AudioAnalysisResult): AudioMarker[] {
            this.labels = classes(result);
            this.state = { ...this.state, classLabels: this.labels };
            const sample = (time: number) => Math.round(Math.max(0, Math.min(this.audioEditor.length, time / result.duration * this.audioEditor.length)));
            return (result.intervals ?? []).map(([start, end], index) => ({ position: [sample(start), sample(end)], name: result.labels?.[index] ?? `${this.state.label} · candidate`, color: this.state.color }));
        }
        getOptionsMetadata() { return metadata(this.labels.length ? this.labels : this.state.classLabels ?? [], feature); }
        static async fromAudioData(editor: AudioEditor, initial: Partial<State> = {}) {
            const module = new TensorflowMarker(editor, { ...this.DEFAULT_STATE, ...initial }); if (!module.state.data) void module.calculate(); return module;
        }
    };
}
export function getTensorflowModules() { return TF_FEATURES.map(feature => feature.kind === "matrix" ? matrix(feature) : feature.kind === "marker" ? marker(feature) : vector(feature)); }
