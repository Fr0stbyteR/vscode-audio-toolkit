import AudioEditor from "../../core/AudioEditor";
import LibrosaMatrixModule from "./LibrosaMatrixModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; coefficients: number; }
export default class Mfcc extends LibrosaMatrixModule<State> {
    static MODULE_ID = "librosa.mfcc"; static MODULE_NAME = "MFCC (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512, coefficients: 20 };
    static DEFAULT_STATE: State = { name: "MFCC", color: "#ffffff", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Coefficient"; protected get algorithm() { return "mfcc" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new Mfcc(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096], coefficients: ["Coefficients", 4, 1, 64] }; }
}
