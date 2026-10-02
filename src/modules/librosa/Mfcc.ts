import AudioEditor from "../../core/AudioEditor";
import LibrosaMatrixModule, { LibrosaMatrixVisualizationState } from "./LibrosaMatrixModule";

interface State extends LibrosaMatrixVisualizationState { frameLength: number; hopLength: number; coefficients: number; }
export default class Mfcc extends LibrosaMatrixModule<State> {
    static MODULE_ID = "librosa.mfcc"; static MODULE_NAME = "MFCC (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512, coefficients: 20 };
    static DEFAULT_STATE: State = { name: "MFCC", color: "#ffffff", colorMap: "inferno", colorMin: 0.12, colorMax: 1, opacity: 1, ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Coefficient"; protected get algorithm() { return "mfcc" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new Mfcc(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], colorMap: ["Color map", "inferno", "spectrum", "grayscale"], colorMin: ["Color range minimum (0–1)", 0, 0.01, 1], colorMax: ["Color range maximum (0–1)", 0, 0.01, 1], opacity: ["Layer opacity", 0.05, 0.05, 1], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096], coefficients: ["Coefficients", 4, 1, 64] }; }
}
