import { AudioAnalysisCacheInfo } from "../../../../src/web/proxies/VSCodeAudioEditor.types";
import { Locale, translate } from "../../i18n/LocaleContext";

export function formatCacheInfo(info: AudioAnalysisCacheInfo | undefined, locale: Locale = "en") {
    if (!info) return translate(locale, "Analysis not cached yet");
    const timestamp = info.createdAt ? new Date(info.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : "";
    switch (info.status) {
        case "hit": return `${translate(locale, "Loaded from analysis cache")}${timestamp ? ` · ${timestamp}` : ""}`;
        case "miss": return translate(locale, "Analyzed now · saved to cache");
        case "refresh": return translate(locale, "Reanalyzed · cache updated");
        case "disabled": return translate(locale, "Analysis cache disabled");
        case "unavailable": return translate(locale, "Analyzed now · cache unavailable");
    }
}

export function formatSampleRange(fromIndex: number, toIndex: number): string {
    // Resampled feature frames can map to fractional positions in the source
    // audio; the data inspector reports the nearest actual sample indices.
    return `${Math.round(fromIndex)}–${Math.round(toIndex)}`;
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
