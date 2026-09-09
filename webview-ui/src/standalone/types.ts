export interface LocalAudioEntry {
    id: string;
    name: string;
    path: string;
    getFile(): Promise<File>;
}

export interface AssetRecord {
    id: string;
    name: string;
    size: number;
    contentType: string;
}
