import { AudioEditorConfiguration, AudioEditorState } from "./AudioEditor";

export interface FrequencyDomainChannelData {
    /** FFTed frames, each advances `hopSize` samples */
    magnitudes: Float32Array[];
    /** FFTed frames, each advances `hopSize` samples */
    phases: Float32Array[];
}

export type ModulesState = { id: string, name: string; visible: boolean | number; state: any }[];

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

export interface VisualizationOptions<T extends AudioToolkitModule> extends VisualizationStyleOptions, Pick<AudioEditorState, "playhead" | "selRange" | "viewRange" | "enabledChannels"> {
    module: T;
    moduleIndex: number;
    configuration: AudioEditorConfiguration;
    configuring: boolean;
    rerenderTimestamp: number;
}

export interface AudioToolkitModule<State = any> {
    Component: React.FunctionComponent<VisualizationOptions<any>>;
    moduleId: string;
    getState(): State;
    setState(newState: State): void;
    getSharableData(): any;
}

export declare const AudioToolkitModule: {
    MODULE_ID: string;
    MODULE_NAME: string;
    DEFAULT_STATE: any;
    prototype: AudioToolkitModule;
    fromAudioData(timedomainData: Float32Array[], frequencyDomainData: FrequencyDomainChannelData[], sampleRate: number, configuration: AudioEditorConfiguration, initialState?: any, sharableData?: Record<string, any>): Promise<AudioToolkitModule>;
};

