import { AudioAnalysisResult } from "../../types";
import { AudioMarker } from "../../components/ModuleUsingMarker";
import AudioEditor from "../../core/AudioEditor";
import LibrosaMarkerModule, { LibrosaMarkerState } from "./LibrosaMarkerModule";

interface State extends LibrosaMarkerState {
    hopLength: number;
    backtrack: boolean;
}

export default class OnsetMarkers extends LibrosaMarkerModule<State> {
    static MODULE_ID = "librosa.onsets";
    static MODULE_NAME = "Onsets (librosa)";
    static DEFAULT_ANALYSIS_STATE = { hopLength: 512, backtrack: false };
    static DEFAULT_STATE: State = { name: "Onsets", color: "#4fc3f7", data: undefined, ...this.DEFAULT_ANALYSIS_STATE };

    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) {
        const module = new OnsetMarkers(audioEditor, { ...this.DEFAULT_STATE, ...initialState });
        if (!module.state.data) void module.calculate();
        return module;
    }
    protected get algorithm() { return "onsets" as const; }
    protected createMarkers(result: AudioAnalysisResult): AudioMarker[] {
        return (result.values ?? []).map(seconds => ({ position: seconds * this.audioEditor.sampleRate, name: "", color: this.state.color }));
    }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> {
        return {
            name: ["Track name"], color: ["Marker color"], data: ["Markers"],
            hopLength: ["Hop length (samples)", 64, 64, 4096],
            backtrack: ["Move markers to preceding energy minimum"]
        };
    }
}
