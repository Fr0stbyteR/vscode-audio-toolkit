import { AudioAnalysisRequest, AudioAnalysisResult } from "../../../src/web/proxies/VSCodeAudioEditor.types";
import { AssetRecord } from "./types";

export interface BackendSettings {
    baseUrl: string;
    token: string;
}

export default class BackendClient {
    private readonly assets = new Map<string, Promise<AssetRecord>>();

    constructor(public readonly settings: BackendSettings) {}

    private headers(extra?: HeadersInit) {
        const headers = new Headers(extra);
        if (this.settings.token) headers.set("Authorization", `Bearer ${this.settings.token}`);
        return headers;
    }

    private url(path: string) {
        return new URL(path.replace(/^\//, ""), `${this.settings.baseUrl.replace(/\/$/, "")}/`).href;
    }

    async health(): Promise<{ status: string; version: string }> {
        const response = await fetch(this.url("api/v1/health"), { headers: this.headers() });
        if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
        return response.json();
    }

    private fileKey(file: File) {
        return `${file.name}:${file.size}:${file.lastModified}`;
    }

    upload(file: File, onProgress?: (message: string) => void) {
        const key = this.fileKey(file);
        const existing = this.assets.get(key);
        if (existing) return existing;
        const promise = (async () => {
            onProgress?.("Uploading selected audio");
            const body = new FormData();
            body.append("file", file, file.name);
            const response = await fetch(this.url("api/v1/assets"), {
                method: "POST",
                headers: this.headers(),
                body
            });
            if (!response.ok) throw new Error(await this.readError(response));
            return response.json() as Promise<AssetRecord>;
        })();
        this.assets.set(key, promise);
        promise.catch(() => this.assets.delete(key));
        return promise;
    }

    async analyze(file: File, request: AudioAnalysisRequest, onProgress?: (message: string) => void): Promise<AudioAnalysisResult> {
        const asset = await this.upload(file, onProgress);
        onProgress?.("Running librosa analysis");
        const response = await fetch(this.url(`api/v1/assets/${encodeURIComponent(asset.id)}/analysis`), {
            method: "POST",
            headers: this.headers({ "Content-Type": "application/json" }),
            body: JSON.stringify(request)
        });
        if (!response.ok) throw new Error(await this.readError(response));
        return response.json();
    }

    private async readError(response: Response) {
        try {
            const payload = await response.json() as { detail?: string };
            return payload.detail || `Backend returned HTTP ${response.status}`;
        } catch {
            return `Backend returned HTTP ${response.status}`;
        }
    }
}
