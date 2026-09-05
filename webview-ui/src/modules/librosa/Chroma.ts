import AudioEditor from "../../core/AudioEditor";
import LibrosaMatrixModule from "./LibrosaMatrixModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; tuning: number; }
export default class Chroma extends LibrosaMatrixModule<State> {
    static MODULE_ID = "librosa.chroma"; static MODULE_NAME = "Chroma (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512, tuning: 0 };
    static DEFAULT_STATE: State = { name: "Chroma", color: "#ffffff", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Pitch class"; protected get algorithm() { return "chroma" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new Chroma(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096], tuning: ["Tuning offset (semitones)", -1, 0.01, 1] }; }
}
