import { AudioToolkitModuleState, AudioToolkitModulesState } from "../../../src/web/proxies/VSCodeAudioEditor.types";
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

export interface VisualizationOptions<T extends AudioToolkitModule, S = ReturnType<T["getState"]>> extends VisualizationStyleOptions, Pick<AudioEditorState, "playhead" | "selRange" | "viewRange" | "enabledChannels"> {
    module: T;
    moduleIndex: number;
    moduleState: S;
    configuration: AudioEditorConfiguration;
    configuring: boolean;
    monitoring: boolean;
    rerenderId: number;
}

export interface AudioToolkitModule<State extends AudioToolkitModuleState = any> {
    Component: React.FunctionComponent<VisualizationOptions<any, any>>;
    moduleId: string;
    getState(): State;
    setState(newState: State): void;
    getSharableData(): any;
    /** for the environment to track state changes, call after `setState`, do not assign */
    onStateChange: ((newState: State) => any) | undefined;
}

export declare const AudioToolkitModule: {
    MODULE_ID: string;
    MODULE_NAME: string;
    DEFAULT_STATE: any;
    prototype: AudioToolkitModule;
    fromAudioData(audioEditor: AudioEditor, initialState?: any, sharableData?: Record<string, any>): Promise<AudioToolkitModule<any>>;
};

