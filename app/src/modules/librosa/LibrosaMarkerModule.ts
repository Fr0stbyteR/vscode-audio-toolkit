import { AudioAnalysisAlgorithm, AudioAnalysisCacheInfo, AudioAnalysisResult } from "../../types";
import { AudioMarker, IAudioToolkitModuleUsingMarker } from "../../components/ModuleUsingMarker";
import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import LibrosaMarkerComponent from "./LibrosaMarkerComponent";
import { formatAnalysisError } from "./LibrosaCacheInfo";

export interface LibrosaMarkerState extends AudioToolkitModuleState {
    color: string;
    data?: AudioMarker[];
}

export default abstract class LibrosaMarkerModule<State extends LibrosaMarkerState = LibrosaMarkerState> implements IAudioToolkitModuleUsingMarker<State> {
    static MODULE_ID = "librosa.base";
    static MODULE_NAME = "Librosa Analysis";
    static DEFAULT_ANALYSIS_STATE: Record<string, unknown> = {};
    static ANALYSIS_ENGINE: "librosa" | "essentia" | "essentia-tf" = "librosa";

    public readonly moduleId = (this.constructor as typeof LibrosaMarkerModule).MODULE_ID;
    public readonly Component = LibrosaMarkerComponent;
    public onStateChange: ((newState: State) => unknown) | undefined;
    public onCalculating: ((state: boolean | [number, string]) => unknown) | undefined;
    public onCacheInfo: ((info: AudioAnalysisCacheInfo | undefined) => unknown) | undefined;
    public state: State;
    protected calculationId = 0;
    protected _isCalculating: boolean | [number, string] = false;
    protected _cacheInfo: AudioAnalysisCacheInfo | undefined;

    protected constructor(public readonly audioEditor: AudioEditor, initialState: State) {
        this.state = initialState;
    }

    get isCalculating() { return this._isCalculating; }
    get cacheInfo() { return this._cacheInfo; }
    get analysisEngine() { return (this.constructor as typeof LibrosaMarkerModule).ANALYSIS_ENGINE; }
    get sharableData() { return Promise.resolve({ state: this.state }); }
    getState() { return this.state; }

    getAnalysisState(state = this.state) {
        const keys = Object.keys((this.constructor as typeof LibrosaMarkerModule).DEFAULT_ANALYSIS_STATE);
        return Object.fromEntries(keys.map(key => [key, (state as unknown as Record<string, unknown>)[key]]));
    }

    setState(newState: State, forceRefresh = false) {
        const keys = Object.keys((this.constructor as typeof LibrosaMarkerModule).DEFAULT_ANALYSIS_STATE);
        const previous = this.state as unknown as Record<string, unknown>;
        const next = newState as unknown as Record<string, unknown>;
        const shouldCalculate = forceRefresh || !newState.data || keys.some(key => next[key] !== previous[key]);
        const normalizedState = newState.color !== this.state.color && newState.data
            ? { ...newState, data: newState.data.map(marker => ({ ...marker, color: newState.color })) }
            : newState;
        this.state = normalizedState;
        this.onStateChange?.(normalizedState);
        if (shouldCalculate) void this.calculate(forceRefresh);
    }

    protected abstract get algorithm(): AudioAnalysisAlgorithm;
    protected abstract createMarkers(result: AudioAnalysisResult): AudioMarker[];
    abstract getOptionsMetadata(): Record<string, [string, ...unknown[]]>;

    async calculate(forceRefresh = false) {
        const calculationId = ++this.calculationId;
        this.setCalculating([5, "Checking analysis cache"]);
        try {
            const options = this.getAnalysisState() as Record<string, string | number | boolean | null>;
            const result = await this.audioEditor.analyze({ engine: this.analysisEngine, algorithm: this.algorithm, options, cachePolicy: forceRefresh ? "refresh" : "use" });
            if (calculationId !== this.calculationId) return;
            this._cacheInfo = result.cache;
            this.onCacheInfo?.(result.cache);
            this.setCalculating([90, "Updating markers"]);
            const data = this.createMarkers(result);
            this.state = { ...this.state, data };
            this.onStateChange?.(this.state);
            this.setCalculating(false);
        } catch (error) {
            if (calculationId !== this.calculationId) return;
            this.setCalculating([-1, formatAnalysisError(error)]);
        }
    }

    protected setCalculating(value: boolean | [number, string]) {
        this._isCalculating = value;
        this.onCalculating?.(value);
    }

    setMarkerPosition(markerIndex: number, position: number | [number, number]) {
        if (!this.state.data?.[markerIndex]) return;
        const clamp = (value: number) => Math.max(0, Math.min(this.audioEditor.length, value));
        const next = typeof position === "number"
            ? clamp(position)
            : [clamp(Math.min(...position)), clamp(Math.max(...position))] as [number, number];
        const data = this.state.data.slice();
        data[markerIndex] = { ...data[markerIndex], position: next };
        this.setState({ ...this.state, data });
    }
    getMarkersFromRange([from, to]: [number, number]) {
        return (this.state.data ?? []).flatMap((marker, index) => {
            const [start, end] = typeof marker.position === "number" ? [marker.position, marker.position] : marker.position;
            return start <= to && end >= from ? [index] : [];
        });
    }
    addMarker(position: number | [number, number], name = "", color = this.state.color) {
        this.setState({ ...this.state, data: [...(this.state.data ?? []), { position, name, color }] });
    }
    deleteMarker(...markerIndexes: number[]) {
        const removed = new Set(markerIndexes);
        this.setState({ ...this.state, data: (this.state.data ?? []).filter((_, index) => !removed.has(index)) });
    }
    setMarkerName(name: string, ...markerIndexes: number[]) {
        const changed = new Set(markerIndexes);
        this.setState({ ...this.state, data: (this.state.data ?? []).map((marker, index) => changed.has(index) ? { ...marker, name } : marker) });
    }
    setMarkerClassName(name: string) { this.setState({ ...this.state, name }); }
    setMarkerColor(color: string, ...markerIndexes: number[]) {
        const changed = new Set(markerIndexes);
        this.setState({ ...this.state, data: (this.state.data ?? []).map((marker, index) => changed.has(index) ? { ...marker, color } : marker) });
    }
}
