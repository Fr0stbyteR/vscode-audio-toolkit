import AudioEditor from "../../core/AudioEditor";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; rollPercent: number; }
export default class SpectralRolloff extends LibrosaVectorModule<State> {
    static MODULE_ID = "librosa.spectralrolloff"; static MODULE_NAME = "Spectral rolloff (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512, rollPercent: 0.85 };
    static DEFAULT_STATE: State = { name: "Spectral rolloff", color: "#ffb74d", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Hz"; protected get algorithm() { return "spectralRolloff" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new SpectralRolloff(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096], rollPercent: ["Energy percentile", 0.01, 0.01, 0.99] }; }
}
