import AudioEditor, { SemanticCurveResult } from "../../core/AudioEditor";
import { AudioToolkitModule, AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import VectorImageProcessor, { VectorDataSlice } from "../../core/VectorImageProcessor";
import ClapRelevanceCurveComponent from "./ClapRelevanceCurveComponent";

export interface ClapRelevanceCurveState extends AudioToolkitModuleState {
    name: string;
    keyword: string;
    prompts: string[];
    windowSeconds: number;
    hopSeconds: number;
    aggregation: "mean" | "max";
    providerId: string;
    color: string;
}

export default class ClapRelevanceCurve implements AudioToolkitModule<ClapRelevanceCurveState> {
    static MODULE_ID = "embedding.relevance-curve";
    static MODULE_NAME = "CLAP keyword relevance";
    static DEFAULT_STATE: ClapRelevanceCurveState = {
        name: "",
        keyword: "",
        prompts: [],
        windowSeconds: 5,
        hopSeconds: 0.5,
        aggregation: "mean",
        providerId: "",
        color: "#c586c0"
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<ClapRelevanceCurveState> = {}) {
        const state = { ...this.DEFAULT_STATE, ...initialState };
        state.prompts = state.prompts?.map(value => value.trim()).filter(Boolean) ?? [state.keyword];
        const module = new ClapRelevanceCurve(audioEditor, state);
        if (state.keyword.trim()) void module.calculate();
        return module;
    }

    readonly moduleId = ClapRelevanceCurve.MODULE_ID;
    readonly Component = ClapRelevanceCurveComponent;
    readonly sharableData = Promise.resolve(null);
    readonly unit = "cos";
    onStateChange: ((newState: ClapRelevanceCurveState) => unknown) | undefined;
    onDataChange: ((data: VectorDataSlice[] | undefined) => unknown) | undefined;
    onCalculating: ((state: boolean | [number, string]) => unknown) | undefined;
    onResult: ((result: SemanticCurveResult | undefined) => unknown) | undefined;
    private data: VectorDataSlice[] | undefined;
    private calculating: boolean | [number, string] = false;
    private result: SemanticCurveResult | undefined;
    private calculationId = 0;
    private controller?: AbortController;
    private partial = false;
    private totalPoints = 0;

    private constructor(public readonly audioEditor: AudioEditor, private state: ClapRelevanceCurveState) {}
    getState() { return this.state; }
    get dataSlices() { return this.data; }
    get isCalculating() { return this.calculating; }
    get lastResult() { return this.result; }
    get incompletePreview(): [number, number] | undefined { return this.partial && this.calculating === false && this.result?.points.length ? [this.result.points.length, this.totalPoints] : undefined; }

    setState(newState: ClapRelevanceCurveState, forceRefresh = false) {
        const analysisChanged = ["keyword", "prompts", "windowSeconds", "hopSeconds", "aggregation", "providerId"]
            .some(key => JSON.stringify((this.state as any)[key]) !== JSON.stringify((newState as any)[key]));
        this.state = newState;
        this.onStateChange?.(newState);
        if (forceRefresh || analysisChanged || (!this.data && !this.calculating)) void this.calculate(forceRefresh);
    }

    async calculate(forceRefresh = false) {
        this.controller?.abort();
        const id = ++this.calculationId;
        this.data = undefined; this.result = undefined; this.partial = false; this.totalPoints = 0;
        this.onDataChange?.(undefined); this.onResult?.(undefined);
        if (!this.state.keyword.trim()) { this.setCalculating(false); return; }
        const controller = this.controller = new AbortController();
        this.setCalculating([0, "Relevance request prepared"]);
        try {
            const result = await this.audioEditor.analyzeSemanticCurve({
                keyword: this.state.keyword.trim(),
                prompts: this.state.prompts.map(value => value.trim()).filter(Boolean),
                timelineDurationSeconds: this.audioEditor.duration,
                windowSeconds: this.state.windowSeconds,
                hopSeconds: this.state.hopSeconds,
                aggregation: this.state.aggregation,
                providerId: this.state.providerId || undefined,
                cachePolicy: forceRefresh ? "refresh" : "use"
            }, (partial, total) => {
                if (id !== this.calculationId) return;
                this.partial = true; this.totalPoints = total;
                this.applyResult(partial);
                this.setCalculating([Math.min(99, partial.points.length / Math.max(1, total) * 100), `${partial.points.length} / ${total}`]);
            }, controller.signal);
            if (id !== this.calculationId) return;
            this.partial = false;
            this.applyResult(result);
            this.setCalculating([100, "Curve prepared"]);
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            if (id === this.calculationId) this.setCalculating(false);
        } catch (reason) {
            if (id !== this.calculationId) return;
            if (controller.signal.aborted) { this.setCalculating(false); return; }
            const message = reason instanceof Error ? reason.message : String(reason);
            this.setCalculating([-1, message]);
        }
    }

    private setCalculating(value: boolean | [number, string]) {
        this.calculating = value;
        this.onCalculating?.(value);
    }
    cancel() { ++this.calculationId; this.controller?.abort(); this.setCalculating(false); }
    dispose() { this.cancel(); }
    private applyResult(result: SemanticCurveResult) {
        const values = Float32Array.from(result.points.map(point => point.cosineSimilarity));
        const positions = Float64Array.from(result.points.map(point => point.timeSeconds * this.audioEditor.sampleRate));
        const audioSamplesPerSample = Math.max(1, (result.hopSeconds || .5) * this.audioEditor.sampleRate);
        this.data = values.length ? [{ samplePositions: positions, startIndex: Math.round(positions[0]), endIndex: Math.ceil(positions[positions.length - 1]), offsetFromSample: 0, audioSamplesPerSample, vectors: [values], resizedVectors: VectorImageProcessor.generateResized([values], audioSamplesPerSample) }] : undefined;
        this.result = result;
        this.onResult?.(result); this.onDataChange?.(this.data);
    }
}
