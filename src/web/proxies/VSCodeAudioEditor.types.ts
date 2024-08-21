
export type AudioUnit = "time" | "sample" | "measure";
export interface AudioEditorConfiguration {
    audioUnit: AudioUnit;
    fftSize: number;
    fftOverlap: number;
    fftWindowFunction: string;
    beatsPerMinute: number;
    beatsPerMeasure: number;
    division: number;
}

export type AudioToolkitModulesState = { moduleId: string, moduleName: string; visible: boolean | number; state: AudioToolkitModuleState }[];

export interface AudioToolkitModuleState {
    name: string;
    // [key: string]: any;
}

export interface AudioToolkitEdit {
    modulesState: AudioToolkitModulesState;
}

export interface IVSCodeAudioEditorHost {
    ready(): void;
    makeEditModulesState(edit: AudioToolkitEdit): void;
}

export interface IVSCodeAudioEditorWebview {
    init(documentInfo: { data?: Uint8Array; uri?: string; workspaceUri?: string; editable?: boolean }, configuration: AudioEditorConfiguration, modulesState: AudioToolkitModulesState | null): Promise<number>;
    updateConfigurationFromHost(configuration: AudioEditorConfiguration): void;
    updateModulesStateFromHost(modulesState: AudioToolkitModulesState | null): void;
    playOrStop(): void;
    pauseOrResume(): void;
}
