import { AudioAnalysisResult } from "../../../../src/web/proxies/VSCodeAudioEditor.types";
import { AudioMarker } from "../../components/ModuleUsingMarker";
import AudioEditor from "../../core/AudioEditor";
import LibrosaMarkerModule, { LibrosaMarkerState } from "./LibrosaMarkerModule";

interface State extends LibrosaMarkerState {
    hopLength: number;
    startBpm: number;
}

export default class BeatMarkers extends LibrosaMarkerModule<State> {
    static MODULE_ID = "librosa.beats";
    static MODULE_NAME = "Beats (librosa)";
    static DEFAULT_ANALYSIS_STATE = { hopLength: 512, startBpm: 120 };
    static DEFAULT_STATE: State = { name: "Beats", color: "#ff8a65", data: undefined, ...this.DEFAULT_ANALYSIS_STATE };

    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) {
        const module = new BeatMarkers(audioEditor, { ...this.DEFAULT_STATE, ...initialState });
        if (!module.state.data) void module.calculate();
        return module;
    }
    protected get algorithm() { return "beats" as const; }
    protected createMarkers(result: AudioAnalysisResult): AudioMarker[] {
        const tempo = Number(result.metadata?.tempo ?? 0);
        return (result.values ?? []).map((seconds, index) => ({
            position: seconds * this.audioEditor.sampleRate,
            name: index === 0 && tempo ? `${tempo.toFixed(1)} BPM` : "",
            color: this.state.color
        }));
    }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> {
        return {
            name: ["Track name"], color: ["Marker color"], data: ["Markers"],
            hopLength: ["Hop length (samples)", 64, 64, 4096],
            startBpm: ["Starting tempo (BPM)", 20, 1, 400]
        };
    }
}
