
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

export interface IVSCodeAudioEditorHost {
    ready(): void;
}

export interface IVSCodeAudioEditorWebview {
    init(documentInfo: { data?: Uint8Array; uri?: string; editable?: boolean }, configuration: AudioEditorConfiguration): Promise<number>;
    updateConfigurationFromHost(configuration: AudioEditorConfiguration): void;
    playOrStop(): void;
    pauseOrResume(): void;
}
