import { AudioEditorConfiguration, AudioEditorState } from "./AudioEditor";

export type VisualizersState = { name: string; visible: boolean | number; state: any }[];

export interface VisualizationStyleOptions {
    phosphorColor: string;
    separatorColor: string;
    playheadColor: string;
    gridColor: string;
    gridRulerColor: string;
    textColor: string;
    labelFont: string;
    monospaceFont: string;
}

export interface VisualizationOptions<T extends AudioToolkitModule> extends VisualizationStyleOptions, Pick<AudioEditorState, "playhead" | "selRange" | "viewRange" | "enabledChannels"> {
    module: T;
    moduleIndex: number;
    configuration: AudioEditorConfiguration;
    rerenderTimestamp: number;
    onSaveState: (moduleIndex: number, state: any) => Promise<void>;
}

export interface AudioToolkitModule {
    Component: React.FunctionComponent<VisualizationOptions<this>>;
}

export interface AudioToolkitModule extends AudioEditorConfiguration {
    [key: string]: any;
}

export declare const AudioToolkitModule: {
    MODULE_ID: string;
    MODULE_NAME: string;
    INITIAL_STATE: any;
    fromAudioData(timedomainData: Float32Array[], frequencyDomainData: Float32Array[][], sampleRate: number, options?: Partial<AudioToolkitModule>): Promise<AudioToolkitModule>;
};
