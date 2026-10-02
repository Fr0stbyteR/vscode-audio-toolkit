import type { AudioAnalysisRequest, AudioToolkitModulesState } from "../types";

export interface CachedAnalysis {
    request: AudioAnalysisRequest;
    savedAt: string;
}

/** Module-owned curves (including manual edits), not native analysis requests. */
export interface CachedModuleState {
    moduleId: string;
    state: Record<string, unknown>;
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
    getCacheableState?: (state: Record<string, unknown>) => Record<string, unknown> | undefined;
}

export function cachedModuleForModule(moduleId: string, Module: AnalysisModuleDefinition, entries: CachedAnalysis[], states: CachedModuleState[] = []) {
    const saved = states.find(entry => entry.moduleId === moduleId);
    const state = saved && Module?.getCacheableState?.(saved.state);
    if (state) return { state };
    const analysis = cachedAnalysisForModule(Module, entries);
    return analysis ? { state: { ...analysis.request.options } } : undefined;
}

export function rememberCachedModuleState(entries: CachedModuleState[], moduleId: string, Module: AnalysisModuleDefinition, state: Record<string, unknown>) {
    if (!Module?.getCacheableState) return entries;
    const saved = Module.getCacheableState(state);
    const rest = entries.filter(entry => entry.moduleId !== moduleId);
    return saved ? [...rest, { moduleId, state: structuredClone(saved) }] : rest;
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

export function cachedModulesToAdd(modules: Record<string, AnalysisModuleDefinition>, entries: CachedAnalysis[], existing: AudioToolkitModulesState, states: CachedModuleState[] = []) {
    const present = new Set(existing.map(module => module.moduleId));
    return Object.entries(modules).flatMap(([moduleId, Module]) => {
        const cached = cachedModuleForModule(moduleId, Module, entries, states);
        return cached && !present.has(moduleId) ? [{ moduleId, state: cached.state }] : [];
    });
}
