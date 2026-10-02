export interface LocalAudioEntry {
    id: string;
    name: string;
    path: string;
    rootHandle?: FileSystemDirectoryHandle;
    getFile(): Promise<File>;
}

export interface AssetRecord {
    id: string;
    name: string;
    size: number;
    contentType: string;
}
