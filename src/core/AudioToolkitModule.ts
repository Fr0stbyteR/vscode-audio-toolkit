import { AudioAnalysisRequest, AudioToolkitModuleState, AudioToolkitModulesState } from "../types";
import AudioEditor, { AudioEditorConfiguration, AudioEditorState } from "./AudioEditor";
export type { AudioToolkitModuleState, AudioToolkitModulesState };

export interface FrequencyDomainChannelData {
    /** FFTed frames, each advances `hopSize` samples */
    magnitudes: Float32Array[];
    /** FFTed frames, each advances `hopSize` samples */
    phases: Float32Array[];
}

export interface VisualizationStyleOptions {
    phosphorColor: string;
    separatorColor: string;
    playheadColor: string;
    gridColor: string;
    gridRulerColor: string;
    textColor: string;
    fadePathColor: string;
    labelFont: string;
    monospaceFont: string;
}

export const VISUALIZER_RULER_WIDTH = 170;
export function getVisualizerRulerWidth(canvas: HTMLCanvasElement): number {
    const editor = canvas.closest<HTMLElement>(".audio-editor-container");
    const cssWidth = editor ? Number.parseFloat(getComputedStyle(editor).getPropertyValue("--visualizer-right-spacing")) : NaN;
    return Number.isFinite(cssWidth) ? cssWidth : VISUALIZER_RULER_WIDTH;
}

export interface VisualizationOptions<T extends AudioToolkitModule, S = ReturnType<T["getState"]>> extends VisualizationStyleOptions, Pick<AudioEditorState, "playhead" | "selRange" | "viewRange" | "enabledChannels"> {
    module: T;
    moduleIndex: number;
    moduleState: S;
    configuration: AudioEditorConfiguration;
    configuring: boolean;
    configurationMode: "analysis" | "appearance" | "both";
    monitoring: boolean;
    overlayMode: boolean;
    activeLayer: boolean;
    rerenderId: number;
}

export interface AudioToolkitModule<State extends AudioToolkitModuleState = any> {
    Component: React.FunctionComponent<VisualizationOptions<any, any>>;
    moduleId: string;
    getState(): State;
    setState(newState: State): void;
    sharableData: Promise<any> | null;
    dispose?(): void;
    analysisComplete?: Promise<void>;
    /** for the environment to track state changes, call after `setState`, do not assign */
    onStateChange: ((newState: State) => any) | undefined;
}

export declare const AudioToolkitModule: {
    MODULE_ID: string;
    MODULE_NAME: string;
    DEFAULT_STATE: any;
    getAnalysisRequest?(state?: Record<string, unknown>): AudioAnalysisRequest;
    getCacheableState?(state: Record<string, unknown>): Record<string, unknown> | undefined;
    prototype: AudioToolkitModule;
    fromAudioData(audioEditor: AudioEditor, initialState?: any, sharableData?: Record<string, any>): Promise<AudioToolkitModule<any>>;
};

