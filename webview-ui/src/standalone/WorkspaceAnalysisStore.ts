import { AudioAnalysisRequest, AudioAnalysisResult, AudioToolkitModulesState } from "../../../src/web/proxies/VSCodeAudioEditor.types";
import { SemanticCurveRequest, SemanticCurveResult, SemanticDescriptionRequest, SemanticDescriptionResult } from "../core/AudioEditor";
import { importScore, loadScoreSource, ScoreFormat } from "../modules/score/ScoreLibrary";

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
}

interface PackedArray {
    rows: number;
    columns: number;
    file: string;
}

interface StoredLibrosaResult {
    format: "audio-toolkit-librosa";
    version: 1;
    request: { algorithm: AudioAnalysisRequest["algorithm"]; options: AudioAnalysisRequest["options"] };
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

async function unpackRows(directory: FileSystemDirectoryHandle, packed: PackedArray): Promise<Float32Array[]> {
    if (!/^[a-f0-9]{64}-(vectors|matrix)\.f32$/.test(packed.file) || !Number.isSafeInteger(packed.rows) || !Number.isSafeInteger(packed.columns) || packed.rows < 1 || packed.columns < 1 || packed.rows * packed.columns > 200_000_000) {
        throw new Error("Invalid stored analysis dimensions.");
    }
    const buffer = await (await (await directory.getFileHandle(packed.file)).getFile()).arrayBuffer();
    if (buffer.byteLength !== packed.rows * packed.columns * 4) throw new Error("Stored analysis array is incomplete.");
    const values = new Float32Array(buffer);
    return Array.from({ length: packed.rows }, (_, index) => values.subarray(index * packed.columns, (index + 1) * packed.columns));
}

/** Local workspace snapshots, independent of the backend's disposable calculation cache. */
export default class WorkspaceAnalysisStore {
    private writable = false;
    private writeQueue: Promise<void> = Promise.resolve();
    private documentTimer: ReturnType<typeof setTimeout> | undefined;
    private pendingState: AudioToolkitModulesState | undefined;

    constructor(private readonly root: FileSystemDirectoryHandle, readonly audioHash: string, readonly relativePath: string) {}

    get canWrite() { return this.writable; }

    async inspectWritePermission() {
        this.writable = await (this.root as PermissionedHandle).queryPermission({ mode: "readwrite" }) === "granted";
        return this.writable;
    }

    async enableWriting() {
        const handle = this.root as PermissionedHandle;
        const permission = await handle.queryPermission({ mode: "readwrite" }) === "granted"
            ? "granted" : await handle.requestPermission({ mode: "readwrite" });
        this.writable = permission === "granted";
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
        const next = this.writeQueue.then(action);
        this.writeQueue = next.catch(() => {});
        return next;
    }

    async loadDocument(): Promise<WorkspaceDocument | undefined> {
        const directory = await this.assetDirectory(false);
        if (!directory) return undefined;
        const document = await readJson<WorkspaceDocument>(directory, "document.json");
        if (document?.format !== "audio-toolkit-workspace" || document.version !== FORMAT_VERSION || document.audioHash !== this.audioHash || !Array.isArray(document.modulesState)) return undefined;
        await this.restoreScores(directory, document.modulesState);
        return document;
    }

    scheduleDocument(state: AudioToolkitModulesState, onError: (reason: unknown) => void) {
        if (!this.writable) return;
        this.pendingState = structuredClone(state);
        if (this.documentTimer) clearTimeout(this.documentTimer);
        this.documentTimer = setTimeout(() => { void this.flushDocument().catch(onError); }, 450);
    }

    async flushDocument() {
        if (this.documentTimer) clearTimeout(this.documentTimer);
        this.documentTimer = undefined;
        const state = this.pendingState;
        this.pendingState = undefined;
        if (!state || !this.writable) return this.writeQueue;
        const document: WorkspaceDocument = {
            format: "audio-toolkit-workspace", version: FORMAT_VERSION, audioHash: this.audioHash,
            relativePath: this.relativePath, savedAt: new Date().toISOString(), modulesState: state
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
        if (request.cachePolicy === "refresh") return undefined;
        const directory = await this.resultsDirectory(false);
        if (!directory) return undefined;
        const key = await this.resultKey("librosa", [request.algorithm, stableOptions(request.options)]);
        const stored = await readJson<StoredLibrosaResult>(directory, `${key}.json`);
        if (!stored || stored.format !== "audio-toolkit-librosa" || stored.version !== FORMAT_VERSION || stored.request.algorithm !== request.algorithm) return undefined;
        const result: AudioAnalysisResult = { ...stored.result, cache: { status: "hit", createdAt: stored.result.cache?.createdAt } };
        if (stored.vectors) result.vectors = await unpackRows(directory, stored.vectors);
        if (stored.matrix) result.matrix = await unpackRows(directory, stored.matrix);
        return result;
    }

    async saveLibrosa(request: AudioAnalysisRequest, result: AudioAnalysisResult) {
        if (!this.writable) return;
        // Pack synchronously: matrix modules release the JSON rows immediately after this call.
        const vectors = result.vectors?.length ? packRows(result.vectors, "") : undefined;
        const matrix = result.matrix?.length ? packRows(result.matrix, "") : undefined;
        const key = await this.resultKey("librosa", [request.algorithm, stableOptions(request.options)]);
        if (vectors) vectors.descriptor.file = `${key}-vectors.f32`;
        if (matrix) matrix.descriptor.file = `${key}-matrix.f32`;
        const { vectors: _vectors, matrix: _matrix, ...base } = result;
        const stored: StoredLibrosaResult = {
            format: "audio-toolkit-librosa", version: FORMAT_VERSION,
            request: { algorithm: request.algorithm, options: stableOptions(request.options) }, result: base,
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
