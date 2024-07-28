
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

export type ModulesState = { moduleId: string, moduleName: string; visible: boolean | number; state: AudioToolkitModuleState }[];

export interface AudioToolkitModuleState {
    name: string;
    [key: string]: any;
}

export interface AudioToolkitEdit {
    prevState: ModulesState;
    state: ModulesState;
}

export interface IVSCodeAudioEditorHost {
    ready(): void;
    makeEditModulesState(edit: AudioToolkitEdit): void;
}

export interface IVSCodeAudioEditorWebview {
    init(documentInfo: { data?: Uint8Array; uri?: string; editable?: boolean }, configuration: AudioEditorConfiguration, modulesState: ModulesState | null): Promise<number>;
    updateConfigurationFromHost(configuration: AudioEditorConfiguration): void;
    updateModulesStateFromHost(modulesState: ModulesState | null): void;
    playOrStop(): void;
    pauseOrResume(): void;
}
