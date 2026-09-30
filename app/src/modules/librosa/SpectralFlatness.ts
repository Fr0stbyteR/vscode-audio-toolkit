import AudioEditor from "../../core/AudioEditor";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; }
export default class SpectralFlatness extends LibrosaVectorModule<State> {
    static MODULE_ID = "librosa.spectralflatness"; static MODULE_NAME = "Spectral flatness (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512 };
    static DEFAULT_STATE: State = { name: "Spectral flatness", color: "#a5d6a7", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "ratio"; protected get algorithm() { return "spectralFlatness" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new SpectralFlatness(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096] }; }
}
