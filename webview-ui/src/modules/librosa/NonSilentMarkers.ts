import { AudioAnalysisResult } from "../../../../src/web/proxies/VSCodeAudioEditor.types";
import { AudioMarker } from "../../components/ModuleUsingMarker";
import AudioEditor from "../../core/AudioEditor";
import LibrosaMarkerModule, { LibrosaMarkerState } from "./LibrosaMarkerModule";

interface State extends LibrosaMarkerState {
    topDb: number;
    frameLength: number;
    hopLength: number;
}

export default class NonSilentMarkers extends LibrosaMarkerModule<State> {
    static MODULE_ID = "librosa.nonsilent";
    static MODULE_NAME = "Non-silent regions (librosa)";
    static DEFAULT_ANALYSIS_STATE = { topDb: 60, frameLength: 2048, hopLength: 512 };
    static DEFAULT_STATE: State = { name: "Regions", color: "#81c784", data: undefined, ...this.DEFAULT_ANALYSIS_STATE };

    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}) {
        const module = new NonSilentMarkers(audioEditor, { ...this.DEFAULT_STATE, ...initialState });
        if (!module.state.data) void module.calculate();
        return module;
    }
    protected get algorithm() { return "nonSilent" as const; }
    protected createMarkers(result: AudioAnalysisResult): AudioMarker[] {
        return (result.intervals ?? []).map(([start, end], index) => ({
            position: [start * this.audioEditor.sampleRate, end * this.audioEditor.sampleRate],
            name: `Region ${index + 1}`,
            color: this.state.color
        }));
    }
    getOptionsMetadata(): Record<string, [string, ...unknown[]]> {
        return {
            name: ["Track name"], color: ["Marker color"], data: ["Markers"],
            topDb: ["Silence threshold below peak (dB)", 1, 1, 120],
            frameLength: ["Frame length (samples)", 256, 256, 8192],
            hopLength: ["Hop length (samples)", 64, 64, 4096]
        };
    }
}
