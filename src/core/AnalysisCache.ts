import type { AudioAnalysisRequest, AudioToolkitModulesState } from "../types";

export interface CachedAnalysis {
    request: AudioAnalysisRequest;
    savedAt: string;
}

export function analysisIdentity(request: AudioAnalysisRequest) {
    const options = Object.fromEntries(Object.entries(request.options ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    return JSON.stringify([request.engine ?? "librosa", request.algorithm, options]);
}

export function analysisParameters(request: AudioAnalysisRequest): AudioAnalysisRequest {
    return { engine: request.engine ?? "librosa", algorithm: request.algorithm, options: { ...request.options } };
}

export function mergeCachedAnalyses(...lists: CachedAnalysis[][]): CachedAnalysis[] {
    const entries = new Map<string, CachedAnalysis>();
    for (const list of lists) for (const entry of list) {
        const key = analysisIdentity(entry.request), previous = entries.get(key);
        if (!previous || entry.savedAt > previous.savedAt) entries.set(key, entry);
    }
    return [...entries.values()];
}

interface AnalysisModuleDefinition {
    getAnalysisRequest?: (state?: Record<string, unknown>) => AudioAnalysisRequest;
}

/** Prefer the default settings; otherwise reuse the most recently saved variant. */
export function cachedAnalysisForModule(Module: AnalysisModuleDefinition, entries: CachedAnalysis[]): CachedAnalysis | undefined {
    if (!Module?.getAnalysisRequest) return undefined;
    const defaults = Module.getAnalysisRequest();
    const candidates = entries.filter(({ request }) => (request.engine ?? "librosa") === (defaults.engine ?? "librosa") && request.algorithm === defaults.algorithm
        && Object.keys(request.options ?? {}).length === Object.keys(defaults.options ?? {}).length
        && Object.keys(request.options ?? {}).every(key => Object.hasOwn(defaults.options ?? {}, key)));
    return candidates.find(({ request }) => analysisIdentity(request) === analysisIdentity(defaults))
        ?? candidates.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
}

export function cachedModulesToAdd(modules: Record<string, AnalysisModuleDefinition>, entries: CachedAnalysis[], existing: AudioToolkitModulesState) {
    const present = new Set(existing.map(module => module.moduleId));
    return Object.entries(modules).flatMap(([moduleId, Module]) => {
        const cached = cachedAnalysisForModule(Module, entries);
        return cached && !present.has(moduleId) ? [{ moduleId, state: { ...cached.request.options } }] : [];
    });
}
