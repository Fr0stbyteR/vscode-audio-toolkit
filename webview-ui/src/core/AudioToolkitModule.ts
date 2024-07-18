import { AudioEditorConfiguration, AudioEditorState } from "./AudioEditor";

export interface VisualizationOptions extends AudioEditorState {
    phosphorColor: string;
    separatorColor: string;
    cursorColor: string;
    gridColor: string;
    gridRulerColor: string;
    textColor: string;
    paintGridLabels: boolean;
    labelFont: string;
    monospaceFont: string;
    configuration: AudioEditorConfiguration;
    windowSize: number[];
}

export interface IAudioToolkitModule {
    Component: React.FunctionComponent<VisualizationOptions>;
}

export interface IAudioToolkitModule extends AudioEditorConfiguration {
    [key: string]: any;
}

export declare const AudioToolkitModule: {
    fromAudioData(timedomainData: Float32Array[], frequencyDomainData: Float32Array[][], sampleRate: number, options?: Partial<IAudioToolkitModule>): Promise<IAudioToolkitModule>;
};
