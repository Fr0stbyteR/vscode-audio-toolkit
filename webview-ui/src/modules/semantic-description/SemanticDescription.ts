import AudioEditor, { SemanticDescriptionRequest, SemanticDescriptionResult } from "../../core/AudioEditor";
import { AudioToolkitModule, AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import SemanticDescriptionComponent from "./SemanticDescriptionComponent";

export interface SemanticDescriptionState extends AudioToolkitModuleState {
    name: string;
    contextSeconds: number;
    maximumResults: number;
    providerId: string;
    autoAnalyze: boolean;
}

export default class SemanticDescription implements AudioToolkitModule<SemanticDescriptionState> {
    static MODULE_ID = "embedding.semantic-description";
    static MODULE_NAME = "CLAP description";
    static DEFAULT_STATE: SemanticDescriptionState = {
        name: "CLAP description",
        contextSeconds: 6,
        maximumResults: 8,
        providerId: "",
        autoAnalyze: true
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<SemanticDescriptionState> = {}) {
        return new SemanticDescription(audioEditor, { ...this.DEFAULT_STATE, ...initialState });
    }

    readonly moduleId = SemanticDescription.MODULE_ID;
    readonly Component = SemanticDescriptionComponent;
    readonly sharableData = Promise.resolve(null);
    onStateChange: ((newState: SemanticDescriptionState) => unknown) | undefined;
    private lastRequestValue: SemanticDescriptionRequest | undefined;
    private lastResultValue: SemanticDescriptionResult | undefined;

    private constructor(public readonly audioEditor: AudioEditor, private state: SemanticDescriptionState) {}
    getState() { return this.state; }
    get lastRequest() { return this.lastRequestValue; }
    get lastResult() { return this.lastResultValue; }
    rememberResult(request: SemanticDescriptionRequest, result: SemanticDescriptionResult) {
        this.lastRequestValue = request;
        this.lastResultValue = result;
    }
    setState(newState: SemanticDescriptionState) {
        this.state = newState;
        this.onStateChange?.(newState);
    }
}
