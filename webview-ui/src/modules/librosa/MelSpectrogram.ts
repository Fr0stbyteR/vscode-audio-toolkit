import AudioEditor from "../../core/AudioEditor";
import LibrosaMatrixModule, { LibrosaMatrixVisualizationState } from "./LibrosaMatrixModule";

interface State extends LibrosaMatrixVisualizationState { frameLength: number; hopLength: number; melBins: number; }
export default class MelSpectrogram extends LibrosaMatrixModule<State> {
    static MODULE_ID = "librosa.melspectrogram"; static MODULE_NAME = "Mel spectrogram (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512, melBins: 128 };
    static DEFAULT_STATE: State = { name: "Mel spectrogram", color: "#ffffff", colorMap: "inferno", colorMin: 0.15, colorMax: 1, opacity: 1, ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Mel bin"; protected get algorithm() { return "melSpectrogram" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new MelSpectrogram(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], colorMap: ["Color map", "inferno", "spectrum", "grayscale"], colorMin: ["Color range minimum (0–1)", 0, 0.01, 1], colorMax: ["Color range maximum (0–1)", 0, 0.01, 1], opacity: ["Layer opacity", 0.05, 0.05, 1], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096], melBins: ["Mel bands", 16, 1, 512] }; }
}
