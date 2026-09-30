import AudioEditor from "../../core/AudioEditor";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; power: number; }
export default class SpectralBandwidth extends LibrosaVectorModule<State> {
    static MODULE_ID = "librosa.spectralbandwidth"; static MODULE_NAME = "Spectral bandwidth (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512, power: 2 };
    static DEFAULT_STATE: State = { name: "Spectral bandwidth", color: "#ffca28", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Hz"; protected get algorithm() { return "spectralBandwidth" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new SpectralBandwidth(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096], power: ["Bandwidth order", 1, 0.5, 4] }; }
}
