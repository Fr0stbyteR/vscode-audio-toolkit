import { AudioAnalysisAlgorithm, AudioAnalysisResult } from "../../../../src/web/proxies/VSCodeAudioEditor.types";
import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModule, AudioToolkitModuleState } from "../../core/AudioToolkitModule";

export interface LibrosaVisualizationState extends AudioToolkitModuleState {
    color: string;
}

export default abstract class LibrosaAnalysisModule<State extends LibrosaVisualizationState> implements AudioToolkitModule<State> {
    static MODULE_ID = "librosa.analysis";
    static MODULE_NAME = "Librosa Analysis";
    static DEFAULT_ANALYSIS_STATE: Record<string, unknown> = {};

    public readonly moduleId = (this.constructor as typeof LibrosaAnalysisModule).MODULE_ID;
    public abstract readonly Component: AudioToolkitModule<State>["Component"];
    public onStateChange: ((newState: State) => unknown) | undefined;
    public onDataChange: ((data: unknown) => unknown) | undefined;
    public onCalculating: ((state: boolean | [number, string]) => unknown) | undefined;
    public state: State;
    protected calculationId = 0;
    protected _isCalculating: boolean | [number, string] = false;

    protected constructor(public readonly audioEditor: AudioEditor, initialState: State) {
        this.state = initialState;
    }

    get isCalculating() { return this._isCalculating; }
    get sharableData() { return Promise.resolve({ state: this.state }); }
    getState() { return this.state; }

    getAnalysisState(state = this.state) {
        const keys = Object.keys((this.constructor as typeof LibrosaAnalysisModule).DEFAULT_ANALYSIS_STATE);
        return Object.fromEntries(keys.map(key => [key, (state as unknown as Record<string, unknown>)[key]]));
    }

    setState(newState: State) {
        const keys = Object.keys((this.constructor as typeof LibrosaAnalysisModule).DEFAULT_ANALYSIS_STATE);
        const previous = this.state as unknown as Record<string, unknown>;
        const next = newState as unknown as Record<string, unknown>;
        const analysisChanged = keys.some(key => next[key] !== previous[key]);
        const shouldCalculate = analysisChanged || (!this.hasData() && this._isCalculating === false);
        this.state = newState;
        this.onStateChange?.(newState);
        if (shouldCalculate) void this.calculate();
    }

    protected abstract get algorithm(): AudioAnalysisAlgorithm;
    protected abstract hasData(): boolean;
    protected abstract consumeResult(result: AudioAnalysisResult): void;
    abstract getOptionsMetadata(): Record<string, [string, ...unknown[]]>;

    async calculate() {
        const calculationId = ++this.calculationId;
        this.setCalculating([5, "Starting librosa"]);
        try {
            const options = this.getAnalysisState() as Record<string, string | number | boolean | null>;
            const result = await this.audioEditor.analyze({ algorithm: this.algorithm, options });
            if (calculationId !== this.calculationId) return;
            this.setCalculating([85, "Preparing display data"]);
            this.consumeResult(result);
            this.setCalculating(false);
        } catch (error) {
            if (calculationId !== this.calculationId) return;
            this.setCalculating([-1, (error as Error).message]);
        }
    }

    protected setCalculating(value: boolean | [number, string]) {
        this._isCalculating = value;
        this.onCalculating?.(value);
    }
}
