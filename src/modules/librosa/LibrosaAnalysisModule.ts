import { AudioAnalysisAlgorithm, AudioAnalysisCacheInfo, AudioAnalysisRequest, AudioAnalysisResult } from "../../types";
import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModule, AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import { formatAnalysisError } from "./LibrosaCacheInfo";

export interface LibrosaVisualizationState extends AudioToolkitModuleState {
    color: string;
}

export default abstract class LibrosaAnalysisModule<State extends LibrosaVisualizationState> implements AudioToolkitModule<State> {
    static MODULE_ID = "librosa.analysis";
    static MODULE_NAME = "Librosa Analysis";
    static DEFAULT_ANALYSIS_STATE: Record<string, unknown> = {};
    static ANALYSIS_ENGINE: "librosa" | "essentia" | "essentia-tf" = "librosa";
    static getAnalysisRequest(state: Record<string, unknown> = this.DEFAULT_ANALYSIS_STATE): AudioAnalysisRequest {
        return { engine: this.ANALYSIS_ENGINE, algorithm: this.prototype.algorithm, options: Object.fromEntries(Object.keys(this.DEFAULT_ANALYSIS_STATE).map(key => [key, state[key] === undefined ? this.DEFAULT_ANALYSIS_STATE[key] : state[key]])) as AudioAnalysisRequest["options"] };
    }

    public readonly moduleId = (this.constructor as typeof LibrosaAnalysisModule).MODULE_ID;
    public abstract readonly Component: AudioToolkitModule<State>["Component"];
    public onStateChange: ((newState: State) => unknown) | undefined;
    public onDataChange: ((data: unknown) => unknown) | undefined;
    public onCalculating: ((state: boolean | [number, string]) => unknown) | undefined;
    public onCacheInfo: ((info: AudioAnalysisCacheInfo | undefined) => unknown) | undefined;
    public state: State;
    protected calculationId = 0;
    protected _isCalculating: boolean | [number, string] = false;
    protected _cacheInfo: AudioAnalysisCacheInfo | undefined;
    public analysisComplete: Promise<void> = Promise.resolve();
    dispose() { this.calculationId++; this.onStateChange = this.onDataChange = this.onCalculating = this.onCacheInfo = undefined; }

    protected constructor(public readonly audioEditor: AudioEditor, initialState: State) {
        this.state = initialState;
    }

    get isCalculating() { return this._isCalculating; }
    get cacheInfo() { return this._cacheInfo; }
    get analysisEngine() { return (this.constructor as typeof LibrosaAnalysisModule).ANALYSIS_ENGINE; }
    get sharableData() { return Promise.resolve({ state: this.state }); }
    getState() { return this.state; }

    getAnalysisState(state = this.state) {
        const keys = Object.keys((this.constructor as typeof LibrosaAnalysisModule).DEFAULT_ANALYSIS_STATE);
        return Object.fromEntries(keys.map(key => [key, (state as unknown as Record<string, unknown>)[key]]));
    }

    setState(newState: State, forceRefresh = false) {
        const keys = Object.keys((this.constructor as typeof LibrosaAnalysisModule).DEFAULT_ANALYSIS_STATE);
        const previous = this.state as unknown as Record<string, unknown>;
        const next = newState as unknown as Record<string, unknown>;
        const analysisChanged = keys.some(key => next[key] !== previous[key]);
        const shouldCalculate = forceRefresh || analysisChanged || (!this.hasData() && this._isCalculating === false);
        this.state = newState;
        this.onStateChange?.(newState);
        if (shouldCalculate) void this.calculate(forceRefresh);
    }

    protected abstract get algorithm(): AudioAnalysisAlgorithm;
    protected abstract hasData(): boolean;
    protected abstract consumeResult(result: AudioAnalysisResult): void;
    abstract getOptionsMetadata(): Record<string, [string, ...unknown[]]>;

    calculate(forceRefresh = false) {
        return this.analysisComplete = this.runCalculate(forceRefresh);
    }
    private async runCalculate(forceRefresh: boolean) {
        const calculationId = ++this.calculationId;
        this.setCalculating([5, "Analysis request prepared"]);
        try {
            const options = this.getAnalysisState() as Record<string, string | number | boolean | null>;
            const result = await this.audioEditor.analyze({ engine: this.analysisEngine, algorithm: this.algorithm, options, cachePolicy: forceRefresh ? "refresh" : "use" });
            if (calculationId !== this.calculationId) return;
            this._cacheInfo = result.cache;
            this.onCacheInfo?.(result.cache);
            this.setCalculating([85, "Analysis data loaded"]);
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            if (calculationId !== this.calculationId) return;
            this.consumeResult(result);
            this.setCalculating([100, "Display data prepared"]);
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            if (calculationId !== this.calculationId) return;
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
}
