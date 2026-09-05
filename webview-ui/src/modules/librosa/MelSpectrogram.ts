import AudioEditor from "../../core/AudioEditor";
import LibrosaMatrixModule from "./LibrosaMatrixModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; melBins: number; }
export default class MelSpectrogram extends LibrosaMatrixModule<State> {
    static MODULE_ID = "librosa.melspectrogram"; static MODULE_NAME = "Mel spectrogram (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512, melBins: 128 };
    static DEFAULT_STATE: State = { name: "Mel spectrogram", color: "#ffffff", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Mel bin"; protected get algorithm() { return "melSpectrogram" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new MelSpectrogram(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["FFT size", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096], melBins: ["Mel bands", 16, 1, 512] }; }
}
