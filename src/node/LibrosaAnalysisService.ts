import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { promisify } from "util";
import { gunzip as gunzipCallback, gzip as gzipCallback } from "zlib";
import * as vscode from "vscode";
import { AudioAnalysisService } from "../web/analysis/AudioAnalysisService";
import { AudioAnalysisCacheInfo, AudioAnalysisRequest, AudioAnalysisResult } from "../web/proxies/VSCodeAudioEditor.types";

interface CacheEnvelope {
    schema: 2;
    createdAt: string;
    result: AudioAnalysisResult;
}

const CACHE_SCHEMA = 2;
const gzip = promisify(gzipCallback);
const gunzip = promisify(gunzipCallback);

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, canonicalize(child)]));
    }
    return value;
}

function withCacheInfo(result: AudioAnalysisResult, cache: AudioAnalysisCacheInfo): AudioAnalysisResult {
    return { ...result, cache };
}

export default class LibrosaAnalysisService implements AudioAnalysisService {
    private readonly cacheDirectory: string;
    private readonly previousCacheDirectory: string;
    private readonly inFlight = new Map<string, Promise<AudioAnalysisResult>>();
    private readonly assets = new Map<string, Promise<string>>();
    private readonly approvedUploads = new Set<string>();
    private cacheEpoch = 0;

    constructor(globalStorageUri: vscode.Uri) {
        this.cacheDirectory = vscode.Uri.joinPath(globalStorageUri, "analysis-cache-v2").fsPath;
        this.previousCacheDirectory = vscode.Uri.joinPath(globalStorageUri, "analysis-cache-v1").fsPath;
    }

    async analyze(uri: vscode.Uri, request: AudioAnalysisRequest): Promise<AudioAnalysisResult> {
        if (uri.scheme !== "file") {
            throw new Error(`Librosa analysis currently requires a local file, received ${uri.scheme}: URI.`);
        }
        const cacheEnabled = vscode.workspace.getConfiguration("audioToolkit").get<boolean>("analysisCache.enabled", true);
        const analysisRequest: AudioAnalysisRequest = { algorithm: request.algorithm, options: request.options };
        if (!cacheEnabled) {
            return withCacheInfo(await this.runUsingBackend(uri.fsPath, { ...analysisRequest, cachePolicy: request.cachePolicy }), { status: "disabled" });
        }

        const key = await this.createCacheKey(uri.fsPath, analysisRequest);
        const filePath = path.join(this.cacheDirectory, `${key}.json.gz`);
        if (request.cachePolicy !== "refresh") {
            const cached = await this.readCache(filePath);
            if (cached) {
                return withCacheInfo(cached.result, { status: "hit", createdAt: cached.createdAt });
            }
        }

        const existing = this.inFlight.get(key);
        if (existing) {
            return existing;
        }
        const epoch = this.cacheEpoch;
        const calculation = this.calculateAndCache(uri.fsPath, analysisRequest, filePath, request.cachePolicy === "refresh", epoch)
            .finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, calculation);
        return calculation;
    }

    async clearCache() {
        this.cacheEpoch++;
        let files = 0;
        let bytes = 0;
        for (const directory of [this.cacheDirectory, this.previousCacheDirectory]) {
            let entries: string[];
            try { entries = await fs.readdir(directory); }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") { continue; }
                throw error;
            }
            await Promise.all(entries.filter(name => name.endsWith(".json.gz")).map(async name => {
                const filePath = path.join(directory, name);
                try {
                    const stat = await fs.stat(filePath);
                    await fs.unlink(filePath);
                    files++;
                    bytes += stat.size;
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") { throw error; }
                }
            }));
        }
        return { files, bytes };
    }

    private async createCacheKey(audioPath: string, request: AudioAnalysisRequest) {
        const stat = await fs.stat(audioPath);
        const backendUrl = this.backendUrl;
        const response = await fetch(new URL("v1/health", backendUrl), { signal: AbortSignal.timeout(10000) });
        if (!response.ok) { throw new Error(`Music backend health check returned HTTP ${response.status}.`); }
        const health = await response.json() as { librosaEngineVersion?: string };
        if (!health.librosaEngineVersion) { throw new Error("Music backend does not support librosa analysis. Update music-embedding-analysis."); }
        const identity = canonicalize({
            schema: CACHE_SCHEMA,
            backend: backendUrl,
            engine: health.librosaEngineVersion,
            audio: {
                path: process.platform === "win32" ? path.resolve(audioPath).toLowerCase() : path.resolve(audioPath),
                size: stat.size,
                modified: stat.mtimeMs
            },
            algorithm: request.algorithm,
            options: request.options ?? {}
        });
        return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
    }

    private async readCache(filePath: string): Promise<CacheEnvelope | undefined> {
        try {
            const envelope = JSON.parse((await gunzip(await fs.readFile(filePath))).toString("utf8")) as CacheEnvelope;
            if (envelope.schema !== CACHE_SCHEMA || !envelope.createdAt || !envelope.result) {
                throw new Error("Unsupported cache entry.");
            }
            await fs.utimes(filePath, new Date(), new Date()).catch(() => undefined);
            return envelope;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return undefined;
            }
            try { await fs.unlink(filePath); } catch { /* Ignore a concurrently removed cache entry. */ }
            return undefined;
        }
    }

    private async calculateAndCache(audioPath: string, request: AudioAnalysisRequest, filePath: string, refresh: boolean, epoch: number) {
        const result = await this.runUsingBackend(audioPath, { ...request, cachePolicy: refresh ? "refresh" : "use" });
        const createdAt = new Date().toISOString();
        let status: AudioAnalysisCacheInfo["status"] = refresh ? "refresh" : "miss";
        try {
            if (epoch !== this.cacheEpoch) {
                return withCacheInfo(result, { status: "unavailable" });
            }
            await fs.mkdir(this.cacheDirectory, { recursive: true });
            const cacheResult = { ...result };
            delete cacheResult.cache;
            const envelope: CacheEnvelope = { schema: CACHE_SCHEMA, createdAt, result: cacheResult };
            const compressed = await gzip(Buffer.from(JSON.stringify(envelope)), { level: 6 });
            if (epoch !== this.cacheEpoch) {
                return withCacheInfo(result, { status: "unavailable" });
            }
            // Partial writes are discarded by readCache. Direct replacement also
            // keeps forced refreshes compatible with Windows file semantics.
            await fs.writeFile(filePath, compressed);
            if (epoch !== this.cacheEpoch) {
                await fs.unlink(filePath).catch(() => undefined);
                return withCacheInfo(result, { status: "unavailable" });
            }
            await this.pruneCache(filePath);
        } catch {
            status = "unavailable";
        }
        return withCacheInfo(result, { status, createdAt });
    }

    private async pruneCache(currentFile: string) {
        const maxSizeMB = vscode.workspace.getConfiguration("audioToolkit").get<number>("analysisCache.maxSizeMB", 512);
        const limit = Math.max(16, maxSizeMB) * 1024 * 1024;
        const names = (await fs.readdir(this.cacheDirectory)).filter(name => name.endsWith(".json.gz"));
        const entries = await Promise.all(names.map(async name => {
            const filePath = path.join(this.cacheDirectory, name);
            const stat = await fs.stat(filePath);
            return { filePath, size: stat.size, modified: stat.mtimeMs };
        }));
        let total = entries.reduce((sum, entry) => sum + entry.size, 0);
        for (const entry of entries.sort((a, b) => a.modified - b.modified)) {
            if (total <= limit) {
                break;
            }
            if (entry.filePath === currentFile) {
                continue;
            }
            await fs.unlink(entry.filePath);
            total -= entry.size;
        }
    }

    private get backendUrl() {
        const configured = vscode.workspace.getConfiguration("audioToolkit").get<string>("backendUrl", "http://127.0.0.1:49321/").trim();
        return `${configured.replace(/\/$/, "")}/`;
    }

    private get headers(): Headers {
        const token = vscode.workspace.getConfiguration("audioToolkit").get<string>("backendToken", "").trim();
        const headers = new Headers();
        if (token) { headers.set("Authorization", `Bearer ${token}`); }
        return headers;
    }

    private async upload(audioPath: string): Promise<string> {
        const stat = await fs.stat(audioPath);
        const key = `${this.backendUrl}:${audioPath}:${stat.size}:${stat.mtimeMs}`;
        const existing = this.assets.get(key);
        if (existing) { return existing; }
        const uploading = (async () => {
            if (!this.approvedUploads.has(key)) {
                const choice = await vscode.window.showWarningMessage(
                    `Upload the complete audio file "${path.basename(audioPath)}" to ${this.backendUrl} for librosa analysis?`,
                    { modal: true, detail: "The configured music analysis service will store a content-addressed copy. Cancel keeps the file local." },
                    "Upload and analyze"
                );
                if (choice !== "Upload and analyze") { throw new Error("Audio upload was cancelled. No analysis was sent to the backend."); }
                this.approvedUploads.add(key);
            }
            const buffer = await fs.readFile(audioPath);
            const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            const headers = this.headers;
            headers.set("X-File-Name", encodeURIComponent(path.basename(audioPath)));
            const response = await fetch(new URL("v1/interactive-assets", this.backendUrl), {
                method: "POST",
                headers,
                body: bytes
            });
            if (!response.ok) { throw new Error(await this.readHttpError(response)); }
            const asset = await response.json() as { id: string };
            return asset.id;
        })();
        this.assets.set(key, uploading);
        void uploading.catch(() => this.assets.delete(key));
        return uploading;
    }

    private async runUsingBackend(audioPath: string, request: AudioAnalysisRequest): Promise<AudioAnalysisResult> {
        let assetId = await this.upload(audioPath);
        const send = (id: string) => {
            const headers = this.headers;
            headers.set("Content-Type", "application/json");
            return fetch(new URL(`v1/interactive-assets/${encodeURIComponent(id)}:librosa`, this.backendUrl), {
                method: "POST", headers, body: JSON.stringify(request)
            });
        };
        let response = await send(assetId);
        if (response.status === 404) {
            this.assets.clear();
            assetId = await this.upload(audioPath);
            response = await send(assetId);
        }
        if (!response.ok) { throw new Error(await this.readHttpError(response)); }
        return response.json() as Promise<AudioAnalysisResult>;
    }

    private async readHttpError(response: Response) {
        try {
            const payload = await response.json() as { detail?: string };
            if (typeof payload.detail === "string") { return payload.detail; }
        } catch { /* Fall back to the HTTP status. */ }
        return `Music backend returned HTTP ${response.status}.`;
    }
}
