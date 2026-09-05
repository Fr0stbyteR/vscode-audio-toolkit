import AudioEditor from "../../core/AudioEditor";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; }
export default class SpectralCentroid extends LibrosaVectorModule<State> {
    static MODULE_ID = "librosa.spectralcentroid"; static MODULE_NAME = "Spectral centroid (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512 };
    static DEFAULT_STATE: State = { name: "Spectral centroid", color: "#ffd54f", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Hz"; protected get algorithm() { return "spectralCentroid" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new SpectralCentroid(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096] }; }
}
