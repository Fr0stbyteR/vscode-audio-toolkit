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
