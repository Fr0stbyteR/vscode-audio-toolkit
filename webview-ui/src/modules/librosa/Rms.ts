import AudioEditor from "../../core/AudioEditor";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

interface State extends LibrosaVisualizationState { frameLength: number; hopLength: number; }
export default class Rms extends LibrosaVectorModule<State> {
    static MODULE_ID = "librosa.rms"; static MODULE_NAME = "RMS (librosa)";
    static DEFAULT_ANALYSIS_STATE = { frameLength: 2048, hopLength: 512 };
    static DEFAULT_STATE: State = { name: "RMS", color: "#4fc3f7", ...this.DEFAULT_ANALYSIS_STATE };
    readonly unit = "RMS"; protected get algorithm() { return "rms" as const; }
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) { const module = new Rms(audioEditor, { ...this.DEFAULT_STATE, ...initialState }); void module.calculate(); return module; }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> { return { name: ["Name"], color: ["Color"], frameLength: ["Frame length", 256, 256, 8192], hopLength: ["Hop length", 64, 64, 4096] }; }
}
