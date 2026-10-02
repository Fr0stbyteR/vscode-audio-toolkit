import { AudioAnalysisRequest, AudioAnalysisResult, AudioToolkitModulesState } from "../types";
import { SemanticCurveRequest, SemanticCurveResult, SemanticDescriptionRequest, SemanticDescriptionResult } from "../core/AudioEditor";
import { importScore, loadScoreSource, ScoreFormat } from "../modules/score/ScoreLibrary";
import { MusicMetadata } from "../core/MusicMetadata";
import type { CachedAnalysis, CachedModuleState } from "../core/AnalysisCache";

const ROOT_NAME = ".audio_toolkit";
const FORMAT_VERSION = 1;

interface PermissionedHandle extends FileSystemDirectoryHandle {
    queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
    requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}

export interface WorkspaceDocument {
    format: "audio-toolkit-workspace";
    version: 1;
    audioHash: string;
    relativePath: string;
    savedAt: string;
    modulesState: AudioToolkitModulesState;
    metadata?: MusicMetadata;
    cachedModuleStates?: CachedModuleState[];
}

interface PackedArray {
    rows: number;
    columns: number;
    file: string;
}

interface StoredLibrosaResult {
    format: "audio-toolkit-librosa";
    version: 1;
    request: { engine?: AudioAnalysisRequest["engine"]; algorithm: AudioAnalysisRequest["algorithm"]; options: AudioAnalysisRequest["options"] };
    result: Omit<AudioAnalysisResult, "vectors" | "matrix">;
    vectors?: PackedArray;
    matrix?: PackedArray;
}

const isNotFound = (reason: unknown) => reason instanceof DOMException && reason.name === "NotFoundError";
const stableOptions = (options: AudioAnalysisRequest["options"]) => Object.fromEntries(Object.entries(options ?? {}).sort(([a], [b]) => a.localeCompare(b)));
const hashText = async (value: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};

async function readJson<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T | undefined> {
    try {
        const file = await (await directory.getFileHandle(name)).getFile();
        return JSON.parse(await file.text()) as T;
    } catch (reason) {
        if (isNotFound(reason)) return undefined;
        throw reason;
    }
}

async function writeFile(directory: FileSystemDirectoryHandle, name: string, value: BlobPart) {
    const handle = await directory.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try {
        await stream.write(value);
        await stream.close();
    } catch (reason) {
        await stream.abort();
        throw reason;
    }
}

function packRows(rows: (number[] | Float32Array)[], file: string): { descriptor: PackedArray; bytes: Uint8Array } {
    const columns = rows[0]?.length ?? 0;
    if (!columns || rows.some(row => row.length !== columns)) throw new Error("Analysis array is not rectangular.");
    const values = new Float32Array(rows.length * columns);
    rows.forEach((row, index) => values.set(row, index * columns));
    return { descriptor: { rows: rows.length, columns, file }, bytes: new Uint8Array(values.buffer) };
}

async function packedFile(directory: FileSystemDirectoryHandle, packed: PackedArray) {
    if (!/^[a-f0-9]{64}-(vectors|matrix)\.f32$/.test(packed.file) || !Number.isSafeInteger(packed.rows) || !Number.isSafeInteger(packed.columns) || packed.rows < 1 || packed.columns < 1 || packed.rows * packed.columns > 200_000_000) {
        throw new Error("Invalid stored analysis dimensions.");
    }
    const file = await (await directory.getFileHandle(packed.file)).getFile();
    if (file.size !== packed.rows * packed.columns * 4) throw new Error("Stored analysis array is incomplete.");
    return file;
}

async function unpackRows(directory: FileSystemDirectoryHandle, packed: PackedArray): Promise<Float32Array[]> {
    const buffer = await (await packedFile(directory, packed)).arrayBuffer();
    const values = new Float32Array(buffer);
    return Array.from({ length: packed.rows }, (_, index) => values.subarray(index * packed.columns, (index + 1) * packed.columns));
}

/** Local workspace snapshots, independent of the backend's disposable calculation cache. */
export default class WorkspaceAnalysisStore {
    private writable = false;
    private resetPending = false;
    private writeQueue: Promise<void> = Promise.resolve();
    private documentTimer: ReturnType<typeof setTimeout> | undefined;
    private pendingState: AudioToolkitModulesState | undefined;
    private pendingMetadata: MusicMetadata | undefined;
    private pendingCachedModuleStates: CachedModuleState[] | undefined;

    constructor(private readonly root: FileSystemDirectoryHandle, readonly audioHash: string, readonly relativePath: string) {}

    get canWrite() { return this.writable; }

    async resetLocal() {
        // Only remove this exact content-addressed asset; never the workspace,
        // originals, model weights, or score records shared by other audio.
        if (!/^[a-f0-9]{64}$/.test(this.audioHash)) throw new Error("Invalid audio cache identity.");
        const existing = await this.assetDirectory(false);
        if (existing || this.writable) {
            const handle = this.root as PermissionedHandle;
            const permission = await handle.queryPermission({ mode: "readwrite" }) === "granted"
                ? "granted" : await handle.requestPermission({ mode: "readwrite" });
            if (permission !== "granted") throw new Error("Folder write permission was not granted.");
        }
        this.resetPending = true;
        this.writable = false;
        if (this.documentTimer) clearTimeout(this.documentTimer);
        this.documentTimer = undefined;
        this.pendingState = undefined;
        this.pendingMetadata = undefined;
        this.pendingCachedModuleStates = undefined;
        // Drain an already running write and suppress any queued/late writes.
        await this.writeQueue;
        try {
            const workspace = await this.workspaceDirectory(false);
            const assets = await workspace?.getDirectoryHandle("assets");
            await assets?.removeEntry(this.audioHash, { recursive: true });
        } catch (reason) { if (!isNotFound(reason)) throw reason; }
    }

    async inspectWritePermission() {
        const permission = await (this.root as PermissionedHandle).queryPermission({ mode: "readwrite" });
        this.writable = !this.resetPending && permission === "granted";
        return this.writable;
    }

    async enableWriting() {
        if (this.resetPending) throw new Error("This audio workspace has been reset.");
        const handle = this.root as PermissionedHandle;
        const permission = await handle.queryPermission({ mode: "readwrite" }) === "granted"
            ? "granted" : await handle.requestPermission({ mode: "readwrite" });
        this.writable = !this.resetPending && permission === "granted";
        if (!this.writable) throw new Error("Folder write permission was not granted.");
        const workspace = (await this.workspaceDirectory(true))!;
        const manifest = await readJson<{ format?: string; version?: number }>(workspace, "manifest.json");
        if (!manifest) {
            await writeFile(workspace, "manifest.json", JSON.stringify({
                format: "audio-toolkit-folder", version: FORMAT_VERSION, createdAt: new Date().toISOString()
            }));
        } else if (manifest.format !== "audio-toolkit-folder" || manifest.version !== FORMAT_VERSION) {
            throw new Error("This .audio_toolkit folder uses an unsupported format version.");
        }
        await this.assetDirectory(true);
    }

    private async workspaceDirectory(create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
        try {
            return await this.root.getDirectoryHandle(ROOT_NAME, { create });
        } catch (reason) {
            if (!create && isNotFound(reason)) return undefined;
            throw reason;
        }
    }

    private async assetDirectory(create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
        try {
            const root = await this.workspaceDirectory(create);
            if (!root) return undefined;
            const assets = await root.getDirectoryHandle("assets", { create });
            return await assets.getDirectoryHandle(this.audioHash, { create });
        } catch (reason) {
            if (!create && isNotFound(reason)) return undefined;
            throw reason;
        }
    }

    private enqueue(action: () => Promise<void>): Promise<void> {
        if (this.resetPending) return Promise.resolve();
        const next = this.writeQueue.then(() => { if (!this.resetPending) return action(); });
        this.writeQueue = next.catch(() => {});
        return next;
    }

    async loadDocument(): Promise<WorkspaceDocument | undefined> {
        if (this.resetPending) return undefined;
        const directory = await this.assetDirectory(false);
        if (!directory) return undefined;
        const document = await readJson<WorkspaceDocument>(directory, "document.json");
        if (document?.format !== "audio-toolkit-workspace" || document.version !== FORMAT_VERSION || document.audioHash !== this.audioHash || !Array.isArray(document.modulesState)) return undefined;
        await this.restoreScores(directory, document.modulesState);
        return document;
    }

    scheduleDocument(state: AudioToolkitModulesState, onError: (reason: unknown) => void, metadata?: MusicMetadata, cachedModuleStates?: CachedModuleState[]) {
        if (!this.writable) return;
        this.pendingState = structuredClone(state);
        this.pendingMetadata = metadata ? structuredClone(metadata) : undefined;
        this.pendingCachedModuleStates = cachedModuleStates ? structuredClone(cachedModuleStates) : undefined;
        if (this.documentTimer) clearTimeout(this.documentTimer);
        this.documentTimer = setTimeout(() => { void this.flushDocument().catch(onError); }, 450);
    }

    async flushDocument() {
        if (this.documentTimer) clearTimeout(this.documentTimer);
        this.documentTimer = undefined;
        const state = this.pendingState;
        const metadata = this.pendingMetadata;
        const cachedModuleStates = this.pendingCachedModuleStates;
        this.pendingState = undefined;
        this.pendingMetadata = undefined;
        this.pendingCachedModuleStates = undefined;
        if (!state || !this.writable) return this.writeQueue;
        const document: WorkspaceDocument = {
            format: "audio-toolkit-workspace", version: FORMAT_VERSION, audioHash: this.audioHash,
            relativePath: this.relativePath, savedAt: new Date().toISOString(), modulesState: state, metadata, cachedModuleStates
        };
        return this.enqueue(async () => {
            const directory = (await this.assetDirectory(true))!;
            await this.saveScores(directory, state);
            await writeFile(directory, "document.json", JSON.stringify(document));
        });
    }

    private scoreKeys(state: AudioToolkitModulesState) {
        return [...new Set(state.map(module => (module.state as { scoreKey?: string }).scoreKey).filter((key): key is string => !!key && /^[a-f0-9]{64}$/.test(key)))];
    }

    private async saveScores(directory: FileSystemDirectoryHandle, state: AudioToolkitModulesState) {
        const keys = this.scoreKeys(state);
        if (!keys.length) return;
        const scores = await directory.getDirectoryHandle("scores", { create: true });
        for (const key of keys) {
            if (await readJson(scores, `${key}.json`)) continue;
            const source = await loadScoreSource(key);
            if (!source) continue;
            await writeFile(scores, `${key}.bin`, source.data);
            await writeFile(scores, `${key}.json`, JSON.stringify({ key, name: source.name, format: source.format }));
        }
    }

    private async restoreScores(directory: FileSystemDirectoryHandle, state: AudioToolkitModulesState) {
        let scores: FileSystemDirectoryHandle;
        try { scores = await directory.getDirectoryHandle("scores"); }
        catch (reason) { if (isNotFound(reason)) return; throw reason; }
        for (const key of this.scoreKeys(state)) {
            if (await loadScoreSource(key)) continue;
            try {
                const metadata = await readJson<{ key: string; name: string; format: ScoreFormat }>(scores, `${key}.json`);
                if (!metadata || metadata.key !== key || !/\.(musicxml|xml|mxl|mid|midi)$/i.test(metadata.name)) continue;
                const data = await (await scores.getFileHandle(`${key}.bin`)).getFile();
                const imported = await importScore(new File([data], metadata.name));
                if (imported.key !== key) throw new Error(`Stored score does not match its checksum: ${metadata.name}`);
            } catch (reason) { console.warn(`Could not restore score ${key} from folder`, reason); }
        }
    }

    private async resultKey(kind: string, request: object) {
        return hashText(JSON.stringify([kind, request]));
    }

    private async resultsDirectory(create: boolean) {
        const asset = await this.assetDirectory(create);
        if (!asset) return undefined;
        try { return await asset.getDirectoryHandle("results", { create }); }
        catch (reason) { if (!create && isNotFound(reason)) return undefined; throw reason; }
    }

    async loadLibrosa(request: AudioAnalysisRequest): Promise<AudioAnalysisResult | undefined> {
        if (this.resetPending) return undefined;
        if (request.cachePolicy === "refresh") return undefined;
        const directory = await this.resultsDirectory(false);
        if (!directory) return undefined;
        const key = await this.resultKey(request.engine ?? "librosa", [request.algorithm, stableOptions(request.options)]);
        const stored = await readJson<StoredLibrosaResult>(directory, `${key}.json`);
        if (!stored || stored.format !== "audio-toolkit-librosa" || stored.version !== FORMAT_VERSION || stored.request.algorithm !== request.algorithm || (stored.request.engine ?? "librosa") !== (request.engine ?? "librosa")) return undefined;
        const result: AudioAnalysisResult = { ...stored.result, cache: { status: "hit", createdAt: stored.result.cache?.createdAt } };
        if (stored.vectors) result.vectors = await unpackRows(directory, stored.vectors);
        if (stored.matrix) result.matrix = await unpackRows(directory, stored.matrix);
        return result;
    }

    async listAnalyses(): Promise<CachedAnalysis[]> {
        if (this.resetPending) return [];
        const directory = await this.resultsDirectory(false);
        if (!directory) return [];
        const entries: CachedAnalysis[] = [];
        // Read only small JSON manifests; never load matrices just to paint a menu.
        for await (const [name, handle] of (directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
            if (handle.kind !== "file" || !/^[a-f0-9]{64}\.json$/.test(name)) continue;
            try {
                const file = await (handle as FileSystemFileHandle).getFile();
                const stored = JSON.parse(await file.text()) as StoredLibrosaResult;
                if (stored.format !== "audio-toolkit-librosa" || stored.version !== FORMAT_VERSION || !stored.request?.algorithm || stored.request.algorithm !== stored.result?.algorithm) continue;
                const { request } = stored;
                if (request.engine && !["librosa", "essentia", "essentia-tf"].includes(request.engine)) continue;
                if (await this.resultKey(request.engine ?? "librosa", [request.algorithm, stableOptions(request.options)]) !== name.slice(0, -5)) continue;
                // Incomplete matrix/vector writes must not be advertised as usable.
                if (stored.matrix) await packedFile(directory, stored.matrix);
                if (stored.vectors) await packedFile(directory, stored.vectors);
                entries.push({ request, savedAt: file.lastModified ? new Date(file.lastModified).toISOString() : stored.result.cache?.createdAt ?? "" });
            } catch (reason) { console.warn("Ignoring incomplete analysis cache entry", name, reason); }
        }
        return entries;
    }

    async saveLibrosa(request: AudioAnalysisRequest, result: AudioAnalysisResult) {
        if (!this.writable) return;
        // Pack synchronously: matrix modules release the JSON rows immediately after this call.
        const vectors = result.vectors?.length ? packRows(result.vectors, "") : undefined;
        const matrix = result.matrix?.length ? packRows(result.matrix, "") : undefined;
        const key = await this.resultKey(request.engine ?? "librosa", [request.algorithm, stableOptions(request.options)]);
        if (vectors) vectors.descriptor.file = `${key}-vectors.f32`;
        if (matrix) matrix.descriptor.file = `${key}-matrix.f32`;
        const { vectors: _vectors, matrix: _matrix, ...base } = result;
        const stored: StoredLibrosaResult = {
            format: "audio-toolkit-librosa", version: FORMAT_VERSION,
            request: { engine: request.engine, algorithm: request.algorithm, options: stableOptions(request.options) }, result: base,
            vectors: vectors?.descriptor, matrix: matrix?.descriptor
        };
        await this.enqueue(async () => {
            const directory = (await this.resultsDirectory(true))!;
            if (vectors) await writeFile(directory, vectors.descriptor.file, vectors.bytes);
            if (matrix) await writeFile(directory, matrix.descriptor.file, matrix.bytes);
            await writeFile(directory, `${key}.json`, JSON.stringify(stored));
        });
    }

    async loadDescription(request: SemanticDescriptionRequest): Promise<SemanticDescriptionResult | undefined> {
        if (this.resetPending) return undefined;
        const directory = await this.resultsDirectory(false);
        if (!directory) return undefined;
        const key = await this.resultKey("description", request);
        const stored = await readJson<SemanticDescriptionResult>(directory, `${key}.json`);
        return stored?.descriptions && stored?.rawMatches ? { ...stored, cached: true } : undefined;
    }

    async saveDescription(request: SemanticDescriptionRequest, result: SemanticDescriptionResult) {
        if (!this.writable) return;
        const key = await this.resultKey("description", request);
        await this.enqueue(async () => writeFile((await this.resultsDirectory(true))!, `${key}.json`, JSON.stringify(result)));
    }

    async loadCurve(request: SemanticCurveRequest): Promise<SemanticCurveResult | undefined> {
        if (this.resetPending) return undefined;
        if (request.cachePolicy === "refresh") return undefined;
        const directory = await this.resultsDirectory(false);
        if (!directory) return undefined;
        const { cachePolicy: _cachePolicy, ...parameters } = request;
        const key = await this.resultKey("curve", parameters);
        const stored = await readJson<SemanticCurveResult>(directory, `${key}.json`);
        return stored?.points ? { ...stored, cached: true } : undefined;
    }

    async saveCurve(request: SemanticCurveRequest, result: SemanticCurveResult) {
        if (!this.writable) return;
        const { cachePolicy: _cachePolicy, ...parameters } = request;
        const key = await this.resultKey("curve", parameters);
        await this.enqueue(async () => writeFile((await this.resultsDirectory(true))!, `${key}.json`, JSON.stringify(result)));
    }
}
