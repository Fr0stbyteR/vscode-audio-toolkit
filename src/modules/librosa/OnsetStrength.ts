import AudioEditor from "../../core/AudioEditor";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { hopLength: number; }
export default class OnsetStrength extends LibrosaVectorModule<State> {
    static MODULE_ID = "librosa.onsetstrength"; static MODULE_NAME = "Onset strength (librosa)";
    static DEFAULT_ANALYSIS_STATE = { hopLength: 512 };
    static DEFAULT_STATE: State = { name: "Onset strength", color: "#4dd0e1", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "strength"; protected get algorithm() { return "onsetStrength" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new OnsetStrength(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], hopLength: ["Hop length", 64, 64, 4096] }; }
}
