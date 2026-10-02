import type { AudioAnalysisRequest, AudioAnalysisResult } from "../types";
import { analysisIdentity, analysisParameters, CachedAnalysis } from "../core/AnalysisCache";

const DATABASE = "audio-toolkit-analysis";
interface Entry extends CachedAnalysis { key: string; audioHash: string; }
function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
            const entries = request.result.createObjectStore("entries", { keyPath: "key" });
            entries.createIndex("audioHash", "audioHash");
            request.result.createObjectStore("results", { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Could not open analysis storage"));
    });
}
function value<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function done(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error("Analysis storage transaction aborted"));
        transaction.onerror = () => reject(transaction.error);
    });
}

/** Separate small menu entries from potentially large matrices. */
export default class BrowserAnalysisStore {
    private resetPending = false;
    private writes: Promise<void> = Promise.resolve();
    constructor(readonly audioHash: string) {}
    private key(request: AudioAnalysisRequest) { return `${this.audioHash}:${analysisIdentity(request)}`; }
    async list(): Promise<CachedAnalysis[]> {
        if (this.resetPending) return [];
        const db = await database();
        try {
            const tx = db.transaction("entries", "readonly");
            const [entries] = await Promise.all([value(tx.objectStore("entries").index("audioHash").getAll(this.audioHash)) as Promise<Entry[]>, done(tx)]);
            return entries.map(({ request, savedAt }) => ({ request, savedAt }));
        } finally { db.close(); }
    }
    async load(request: AudioAnalysisRequest): Promise<AudioAnalysisResult | undefined> {
        if (this.resetPending || request.cachePolicy === "refresh") return undefined;
        const db = await database();
        try {
            const tx = db.transaction("results", "readonly");
            const [record] = await Promise.all([value(tx.objectStore("results").get(this.key(request))) as Promise<{ result: AudioAnalysisResult } | undefined>, done(tx)]);
            return record ? { ...record.result, cache: { ...record.result.cache, status: "hit" } } : undefined;
        } finally { db.close(); }
    }
    save(request: AudioAnalysisRequest, result: AudioAnalysisResult) {
        if (this.resetPending) return Promise.resolve();
        const operation = this.writes.then(async () => {
            if (this.resetPending) return;
            const db = await database();
            try {
                if (this.resetPending) return;
                const key = this.key(request), tx = db.transaction(["entries", "results"], "readwrite");
                const completed = done(tx);
                // IDB clones immediately: Matrix modules can subsequently release
                // the response rows without corrupting the saved analysis.
                try {
                    tx.objectStore("results").put({ key, result });
                    tx.objectStore("entries").put({ key, audioHash: this.audioHash, request: analysisParameters(request), savedAt: new Date().toISOString() } satisfies Entry);
                } catch (reason) {
                    tx.abort();
                    await completed.catch(() => {});
                    throw reason;
                }
                await completed;
            } finally { db.close(); }
        });
        this.writes = operation.catch(() => {});
        return operation;
    }
    async resetLocal() {
        this.resetPending = true;
        await this.writes;
        const db = await database();
        try {
            const tx = db.transaction(["entries", "results"], "readwrite");
            const completed = done(tx);
            await Promise.all([completed, value(tx.objectStore("entries").index("audioHash").getAllKeys(this.audioHash)).then(keys => {
                for (const key of keys) { tx.objectStore("entries").delete(key); tx.objectStore("results").delete(key); }
            })]);
        } finally { db.close(); }
    }
}
