import { spawn } from "child_process";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { promisify } from "util";
import { gunzip as gunzipCallback, gzip as gzipCallback } from "zlib";
import * as vscode from "vscode";
import { AudioAnalysisService } from "../web/analysis/AudioAnalysisService";
import { AudioAnalysisCacheInfo, AudioAnalysisRequest, AudioAnalysisResult } from "../web/proxies/VSCodeAudioEditor.types";

interface PythonCommand {
    executable: string;
    args: string[];
}

interface CacheEnvelope {
    schema: 1;
    createdAt: string;
    result: AudioAnalysisResult;
}

const CACHE_SCHEMA = 1;
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
    private readonly inFlight = new Map<string, Promise<AudioAnalysisResult>>();
    private engineFingerprint: Promise<string> | undefined;
    private cacheEpoch = 0;

    constructor(private readonly extensionUri: vscode.Uri, globalStorageUri: vscode.Uri) {
        this.cacheDirectory = vscode.Uri.joinPath(globalStorageUri, "analysis-cache-v1").fsPath;
    }

    async analyze(uri: vscode.Uri, request: AudioAnalysisRequest): Promise<AudioAnalysisResult> {
        if (uri.scheme !== "file") {
            throw new Error(`Librosa analysis currently requires a local file, received ${uri.scheme}: URI.`);
        }
        const cacheEnabled = vscode.workspace.getConfiguration("audioToolkit").get<boolean>("analysisCache.enabled", true);
        const analysisRequest: AudioAnalysisRequest = { algorithm: request.algorithm, options: request.options };
        if (!cacheEnabled) {
            return withCacheInfo(await this.runUsingPython(uri.fsPath, analysisRequest), { status: "disabled" });
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
        let entries: string[];
        try {
            entries = await fs.readdir(this.cacheDirectory);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return { files: 0, bytes: 0 };
            }
            throw error;
        }
        let files = 0;
        let bytes = 0;
        await Promise.all(entries.filter(name => name.endsWith(".json.gz")).map(async name => {
            const filePath = path.join(this.cacheDirectory, name);
            try {
                const stat = await fs.stat(filePath);
                await fs.unlink(filePath);
                files++;
                bytes += stat.size;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw error;
                }
            }
        }));
        return { files, bytes };
    }

    private get scriptPath() {
        return vscode.Uri.joinPath(this.extensionUri, "python", "audio_toolkit_engine.py").fsPath;
    }

    private async createCacheKey(audioPath: string, request: AudioAnalysisRequest) {
        const stat = await fs.stat(audioPath);
        this.engineFingerprint ??= fs.readFile(this.scriptPath).then(data => createHash("sha256").update(data).digest("hex"));
        const identity = canonicalize({
            schema: CACHE_SCHEMA,
            engine: await this.engineFingerprint,
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
        const result = await this.runUsingPython(audioPath, request);
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

    private async runUsingPython(audioPath: string, request: AudioAnalysisRequest) {
        const configured = vscode.workspace.getConfiguration("audioToolkit").get<string>("pythonPath", "").trim();
        const commands = configured ? [{ executable: configured, args: [] }] : await this.getPythonCommands();
        let lastError: Error | undefined;
        let dependencyError: Error | undefined;
        for (const command of commands) {
            try {
                return await this.run(command, audioPath, request);
            } catch (error) {
                lastError = error as Error;
                if (/Librosa backend is unavailable/i.test(lastError.message)) {
                    dependencyError ??= lastError;
                }
                if (configured || !/ENOENT|not found|Librosa backend is unavailable/i.test(lastError.message)) {
                    break;
                }
            }
        }
        throw dependencyError ?? lastError ?? new Error("No Python 3 interpreter was found. Configure audioToolkit.pythonPath or create a .venv in the workspace.");
    }

    private async getPythonCommands(): Promise<PythonCommand[]> {
        const commands: PythonCommand[] = [];
        if (vscode.workspace.isTrusted) {
            const relativeExecutables = process.platform === "win32"
                ? [[".venv-librosa", "Scripts", "python.exe"], [".venv", "Scripts", "python.exe"]]
                : [[".venv-librosa", "bin", "python"], [".venv", "bin", "python"]];
            for (const folder of vscode.workspace.workspaceFolders ?? []) {
                for (const segments of relativeExecutables) {
                    const executable = vscode.Uri.joinPath(folder.uri, ...segments).fsPath;
                    try {
                        await fs.access(executable);
                        commands.push({ executable, args: [] });
                    } catch {
                        // This workspace does not use this virtual-environment convention.
                    }
                }
            }
        }
        commands.push(...(process.platform === "win32"
            ? [{ executable: "py", args: ["-3"] }, { executable: "python3", args: [] }, { executable: "python", args: [] }]
            : [{ executable: "python3", args: [] }, { executable: "python", args: [] }]));
        const seen = new Set<string>();
        return commands.filter(command => {
            const key = `${process.platform === "win32" ? command.executable.toLowerCase() : command.executable}\0${command.args.join("\0")}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    private run(command: PythonCommand, audioPath: string, request: AudioAnalysisRequest): Promise<AudioAnalysisResult> {
        return new Promise((resolve, reject) => {
            const child = spawn(command.executable, [...command.args, this.scriptPath], {
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"]
            });
            const stdout: Buffer[] = [];
            const stderr: Buffer[] = [];
            child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
            child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
            child.once("error", reject);
            child.once("close", code => {
                const output = Buffer.concat(stdout).toString("utf8").trim();
                const errorOutput = Buffer.concat(stderr).toString("utf8").trim();
                if (code !== 0) {
                    reject(new Error(errorOutput || output || `Python analysis exited with code ${code}.`));
                    return;
                }
                try {
                    resolve(JSON.parse(output) as AudioAnalysisResult);
                } catch (error) {
                    reject(new Error(`Invalid response from librosa backend: ${(error as Error).message}`));
                }
            });
            child.stdin.end(JSON.stringify({ path: audioPath, ...request }));
        });
    }
}
