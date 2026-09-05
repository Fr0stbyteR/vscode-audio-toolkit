import { AudioAnalysisCacheInfo } from "../../../../src/web/proxies/VSCodeAudioEditor.types";

export function formatCacheInfo(info: AudioAnalysisCacheInfo | undefined) {
    if (!info) return "Analysis not cached yet";
    const timestamp = info.createdAt ? new Date(info.createdAt).toLocaleString() : "";
    switch (info.status) {
        case "hit": return `Loaded from analysis cache${timestamp ? ` · ${timestamp}` : ""}`;
        case "miss": return "Analyzed now · saved to cache";
        case "refresh": return "Reanalyzed · cache updated";
        case "disabled": return "Analysis cache disabled";
        case "unavailable": return "Analyzed now · cache unavailable";
    }
}

export function formatAnalysisError(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error) return error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
    try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== "{}") return serialized;
    } catch {
        // Fall through to a stable message for non-serializable values.
    }
    return "Audio analysis failed for an unknown reason. Check the Audio Toolkit output log.";
}
