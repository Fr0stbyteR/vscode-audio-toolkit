import { SemanticCurveRequest, SemanticCurveResult, SemanticDescriptionRequest, SemanticDescriptionResult } from "../core/AudioEditor";
import { AudioAnalysisRequest, AudioAnalysisResult } from "../types";

export interface BackendSettings { baseUrl: string; token: string; }

interface InteractiveAsset { id: string; }

export default class MusicAnalysisClient {
    private readonly assets = new WeakMap<File, Promise<InteractiveAsset>>();
    private readonly descriptions = new Map<string, Promise<SemanticDescriptionResult>>();
    private readonly curves = new Map<string, Promise<SemanticCurveResult>>();

    constructor(public readonly settings: BackendSettings) {}

    private headers(extra?: HeadersInit) {
        const headers = new Headers(extra);
        if (this.settings.token) headers.set("Authorization", `Bearer ${this.settings.token}`);
        return headers;
    }

    private url(path: string) {
        return new URL(path.replace(/^\//, ""), `${this.settings.baseUrl.replace(/\/$/, "")}/`).href;
    }

    async health() {
        const response = await fetch(this.url("v1/capabilities"), { headers: this.headers() });
        if (!response.ok) throw new Error(`Music backend returned HTTP ${response.status}`);
        return response.json() as Promise<{ providers: Array<{ loaded: boolean; supportsTextEmbeddings: boolean }> }>;
    }

    upload(file: File) {
        const existing = this.assets.get(file);
        if (existing) return existing;
        const promise = (async () => {
            const response = await fetch(this.url("v1/interactive-assets"), {
                method: "POST",
                headers: this.headers({
                    "Content-Type": file.type || "application/octet-stream",
                    "X-File-Name": encodeURIComponent(file.name)
                }),
                body: file
            });
            if (!response.ok) throw new Error(await this.readError(response));
            return response.json() as Promise<InteractiveAsset>;
        })();
        this.assets.set(file, promise);
        promise.catch(() => this.assets.delete(file));
        return promise;
    }

    async describe(file: File, request: SemanticDescriptionRequest): Promise<SemanticDescriptionResult> {
        let asset = await this.upload(file);
        const key = [asset.id, request.startSeconds.toFixed(3), request.endSeconds.toFixed(3), request.timelineDurationSeconds?.toFixed(3) || "native", request.maximumResults, request.providerId || "auto"].join(":");
        const cached = this.descriptions.get(key);
        if (cached) return { ...(await cached), cached: true };
        const promise = (async () => {
            const send = (assetId: string) => fetch(this.url(`v1/interactive-assets/${encodeURIComponent(assetId)}:describe`), {
                method: "POST",
                headers: this.headers({ "Content-Type": "application/json" }),
                body: JSON.stringify(request)
            });
            let response = await send(asset.id);
            // The service keeps the interactive asset registry in memory. A backend
            // restart should recover transparently instead of leaving the module stale.
            if (response.status === 404) {
                this.assets.delete(file);
                asset = await this.upload(file);
                response = await send(asset.id);
            }
            if (!response.ok) throw new Error(await this.readError(response));
            return response.json() as Promise<SemanticDescriptionResult>;
        })();
        this.descriptions.set(key, promise);
        promise.catch(() => this.descriptions.delete(key));
        return promise;
    }

    async analyze(file: File, request: AudioAnalysisRequest): Promise<AudioAnalysisResult> {
        let asset = await this.upload(file);
        const send = (assetId: string) => fetch(this.url(`v1/interactive-assets/${encodeURIComponent(assetId)}:librosa`), {
            method: "POST",
            headers: this.headers({ "Content-Type": "application/json" }),
            body: JSON.stringify(request)
        });
        let response = await send(asset.id);
        if (response.status === 404) {
            this.assets.delete(file);
            asset = await this.upload(file);
            response = await send(asset.id);
        }
        if (!response.ok) throw new Error(await this.readError(response));
        return response.json() as Promise<AudioAnalysisResult>;
    }

    async relevanceCurve(file: File, request: SemanticCurveRequest): Promise<SemanticCurveResult> {
        let asset = await this.upload(file);
        const key = JSON.stringify([asset.id, request.keyword, request.prompts, request.timelineDurationSeconds, request.windowSeconds, request.hopSeconds, request.aggregation, request.providerId || "auto"]);
        if (request.cachePolicy !== "refresh") {
            const cached = this.curves.get(key);
            if (cached) return { ...(await cached), cached: true };
        }
        const promise = (async () => {
            const send = (assetId: string) => fetch(this.url(`v1/interactive-assets/${encodeURIComponent(assetId)}:relevance-curve`), {
                method: "POST",
                headers: this.headers({ "Content-Type": "application/json" }),
                body: JSON.stringify(request)
            });
            let response = await send(asset.id);
            if (response.status === 404) {
                this.assets.delete(file);
                asset = await this.upload(file);
                response = await send(asset.id);
            }
            if (!response.ok) throw new Error(await this.readError(response));
            return response.json() as Promise<SemanticCurveResult>;
        })();
        this.curves.set(key, promise);
        promise.catch(() => this.curves.delete(key));
        return promise;
    }

    private async readError(response: Response) {
        try {
            const payload = await response.json() as { detail?: string | { message?: string } };
            if (typeof payload.detail === "string") return payload.detail;
            if (payload.detail?.message) return payload.detail.message;
        } catch { /* use fallback */ }
        return `Music backend returned HTTP ${response.status}`;
    }
}
