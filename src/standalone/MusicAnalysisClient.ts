import { SemanticCurveRequest, SemanticCurveResult, SemanticDescriptionRequest, SemanticDescriptionResult } from "../core/AudioEditor";
import { AudioAnalysisRequest, AudioAnalysisResult } from "../types";
import type { MoodRequest, MoodResult } from "../core/MoodAnalysis";
import type { CurveProgress, ScoreRecognitionProgress, ScoreRecognitionResult } from "../core/ScoreRecognition";
import { readNdjson } from "./readNdjson";

export interface BackendSettings { baseUrl: string; token: string; }

interface InteractiveAsset { id: string; }

export default class MusicAnalysisClient {
    private readonly assets = new WeakMap<File, Promise<InteractiveAsset>>();
    private readonly descriptions = new Map<string, Promise<SemanticDescriptionResult>>();
    private readonly curves = new Map<string, SemanticCurveResult>();
    private readonly fileVersions = new WeakMap<File, number>();

    clearAudio(file: File) {
        this.fileVersions.set(file, (this.fileVersions.get(file) ?? 0) + 1);
        const uploaded = this.assets.get(file);
        this.assets.delete(file);
        void uploaded?.then(asset => {
            for (const key of this.descriptions.keys()) if (key.startsWith(`${asset.id}:`)) this.descriptions.delete(key);
            for (const key of this.curves.keys()) if (JSON.parse(key)[0] === asset.id) this.curves.delete(key);
        }).catch(() => {});
    }

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
        promise.catch(() => { if (this.assets.get(file) === promise) this.assets.delete(file); });
        return promise;
    }

    async describe(file: File, request: SemanticDescriptionRequest): Promise<SemanticDescriptionResult> {
        const version = this.fileVersions.get(file) ?? 0;
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
        if ((this.fileVersions.get(file) ?? 0) === version) this.descriptions.set(key, promise);
        promise.catch(() => { if (this.descriptions.get(key) === promise) this.descriptions.delete(key); });
        return promise;
    }

    async analyze(file: File, request: AudioAnalysisRequest): Promise<AudioAnalysisResult> {
        if (request.engine === "essentia" || request.engine === "essentia-tf") {
            const response = await fetch(this.url(`v1/${request.engine === "essentia-tf" ? "essentia-tf" : "essentia"}/capabilities`), { headers: this.headers() });
            if (!response.ok) throw new Error(response.status === 404 ? "Restart the updated backend to enable Essentia analysis" : await this.readError(response));
            const capability = await response.json() as { available: boolean; reason?: string; algorithms: string[] };
            if (!capability.available) throw new Error(capability.reason || "Native Essentia is not available");
            if (!capability.algorithms.includes(request.algorithm)) throw new Error("Rebuild the Essentia native worker to enable this algorithm");
        }
        let asset = await this.upload(file);
        const send = (assetId: string) => fetch(this.url(`v1/interactive-assets/${encodeURIComponent(assetId)}:${request.engine === "essentia-tf" ? "essentia-tf" : request.engine === "essentia" ? "essentia" : "librosa"}`), {
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
    async mood(file: File, request: MoodRequest): Promise<MoodResult> {
        const capabilityResponse = await fetch(this.url("v1/mood/capabilities"), { headers: this.headers() });
        if (!capabilityResponse.ok) throw new Error(capabilityResponse.status === 404 ? "Restart the updated backend to enable mood analysis" : await this.readError(capabilityResponse));
        const capability = await capabilityResponse.json() as { available: boolean; reason?: string };
        if (!capability.available) throw new Error(capability.reason || "Mood model is not available");
        let asset = await this.upload(file);
        const send = (id: string) => fetch(this.url(`v1/interactive-assets/${encodeURIComponent(id)}:mood-curve`), {
            method: "POST", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify(request)
        });
        let response = await send(asset.id);
        if (response.status === 404) { this.assets.delete(file); asset = await this.upload(file); response = await send(asset.id); }
        if (!response.ok) throw new Error(await this.readError(response));
        return response.json() as Promise<MoodResult>;
    }

    async recognizeScore(file: File, onProgress?: (progress: ScoreRecognitionProgress) => void, signal?: AbortSignal): Promise<ScoreRecognitionResult> {
        if (file.size > 50 * 1024 * 1024) throw new Error("Score upload exceeds 50 MiB");
        const response = await fetch(this.url("v1/omr"), { method: "POST", headers: this.headers({ "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }), body: file, signal });
        if (!response.ok) throw new Error(response.status === 404 ? "Restart the updated backend to enable OMR" : await this.readError(response));
        const { jobId } = await response.json() as { jobId: string };
        try {
            while (true) {
                signal?.throwIfAborted();
                const status = await fetch(this.url(`v1/jobs/${jobId}`), { headers: this.headers(), signal });
                if (!status.ok) throw new Error(await this.readError(status));
                const job = await status.json();
                onProgress?.({ progress: job.progress, message: job.message || "Preparing score recognition" });
                if (job.state === "succeeded") return job.result as ScoreRecognitionResult;
                if (job.state === "failed") throw new Error(job.error?.detail || "Score recognition failed");
                if (job.state === "cancelled") throw new DOMException("Cancelled", "AbortError");
                await new Promise<void>(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            if (signal?.aborted) void fetch(this.url(`v1/jobs/${jobId}:cancel`), { method: "POST", headers: this.headers(), keepalive: true }).catch(() => undefined);
            throw error;
        }
    }

    async relevanceCurve(file: File, request: SemanticCurveRequest, onProgress?: CurveProgress, signal?: AbortSignal): Promise<SemanticCurveResult> {
        const version = this.fileVersions.get(file) ?? 0;
        let asset = await this.upload(file);
        const key = JSON.stringify([asset.id, request.keyword, request.prompts, request.timelineDurationSeconds, request.windowSeconds, request.hopSeconds, request.aggregation, request.providerId || "auto"]);
        if (request.cachePolicy !== "refresh") {
            const cached = this.curves.get(key);
            if (cached) { onProgress?.(cached, cached.points.length); return { ...cached, cached: true }; }
        }
        const promise = (async () => {
            const send = (assetId: string, streaming = true) => fetch(this.url(`v1/interactive-assets/${encodeURIComponent(assetId)}:${streaming ? "relevance-curve-stream" : "relevance-curve"}`), {
                method: "POST",
                headers: this.headers({ "Content-Type": "application/json" }),
                body: JSON.stringify(request), signal
            });
            let response = await send(asset.id);
            if (response.status === 404) {
                this.assets.delete(file);
                asset = await this.upload(file);
                response = await send(asset.id);
            }
            if (response.status === 404) response = await send(asset.id, false);
            if (!response.ok) throw new Error(await this.readError(response));
            if (!response.headers.get("Content-Type")?.includes("ndjson")) return response.json() as Promise<SemanticCurveResult>;
            let completed: SemanticCurveResult | undefined;
            const points: SemanticCurveResult["points"] = [];
            await readNdjson(response, event => {
                if (event.type === "error") throw new Error(event.message);
                if (event.type === "chunk") {
                    if (event.offset !== points.length || !Array.isArray(event.result?.points)) throw new Error("Invalid relevance stream sequence");
                    points.push(...event.result.points);
                    onProgress?.({ ...event.result, points: [...points] }, event.total);
                }
                if (event.type === "complete") completed = event.result;
            });
            if (!completed) throw new Error("Relevance stream ended before completion");
            return completed;
        })();
        const result = await promise;
        if (this.curves.size >= 64) this.curves.delete(this.curves.keys().next().value!);
        if ((this.fileVersions.get(file) ?? 0) === version) this.curves.set(key, result);
        return result;
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
