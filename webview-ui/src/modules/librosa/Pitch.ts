import AudioEditor from "../../core/AudioEditor";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; fmin: number; fmax: number; }
export default class Pitch extends LibrosaVectorModule<State> {
    static MODULE_ID = "librosa.pitch"; static MODULE_NAME = "Pitch YIN (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512, fmin: 65.4, fmax: 2093 };
    static DEFAULT_STATE: State = { name: "Pitch", color: "#ce93d8", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "Hz"; protected get algorithm() { return "pitch" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new Pitch(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["Frame length", 512, 256, 8192], hopLength: ["Hop length", 64, 64, 4096], fmin: ["Minimum frequency (Hz)", 20, 1, 4000], fmax: ["Maximum frequency (Hz)", 100, 1, 12000] }; }
}
