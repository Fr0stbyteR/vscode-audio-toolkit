export interface MusicRegion { id: string; start: number; end: number; label: string; }
export interface TempoPoint { id: string; time: number; bpm: number; }
export interface MusicMetadataValues {
    title: string;
    composer: string;
    form: MusicRegion[];
    tempo: TempoPoint[];
    keys: MusicRegion[];
    instruments: string[];
    valence: number | null;
    arousal: number | null;
    meters: MusicRegion[];
    context: string;
    theme: string;
    otherTheme: string;
}
export type MetadataField = keyof MusicMetadataValues;
export interface MusicMetadata {
    values: MusicMetadataValues;
    sources: Partial<Record<MetadataField, "user" | "musicxml">>;
    inferred?: { scoreKey: string; fileName: string; values: Partial<MusicMetadataValues> };
}
export const EMPTY_METADATA: MusicMetadataValues = { title: "", composer: "", form: [], tempo: [], keys: [], instruments: [], valence: null, arousal: null, meters: [], context: "", theme: "", otherTheme: "" };
export const METADATA_LABELS: Record<MetadataField, string> = { title: "Title", composer: "Composer", form: "Global structure", tempo: "Tempo (BPM)", keys: "Mode / key", instruments: "Instruments", valence: "Valence", arousal: "Arousal", meters: "Meter", context: "Context / music function", theme: "Theme type", otherTheme: "Other theme" };
export function emptyMetadata(): MusicMetadata { return { values: structuredClone(EMPTY_METADATA), sources: {} }; }
export function hasMetadataValue(value: unknown) { return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0); }
export function normalizeInstruments(value: unknown): string[] {
    const entries = typeof value === "string" ? value.split(/[,;\n]/) : Array.isArray(value) ? value : [];
    return [...new Set(entries.filter((entry): entry is string => typeof entry === "string").map(entry => entry.trim()).filter(Boolean))];
}

/** Old/partially edited workspace documents must not break the inspector. */
export function restoreMetadata(saved: MusicMetadata | undefined): MusicMetadata {
    const next = emptyMetadata();
    if (!saved || typeof saved !== "object") return next;
    for (const field of Object.keys(EMPTY_METADATA) as MetadataField[]) {
        const value = saved.values?.[field];
        const defaultValue = EMPTY_METADATA[field];
        if (typeof defaultValue === "string" && typeof value === "string") Object.assign(next.values, { [field]: value });
        if (defaultValue === null && typeof value === "number" && Number.isFinite(value)) Object.assign(next.values, { [field]: Math.max(-1, Math.min(1, value)) });
        if (field === "instruments") next.values.instruments = normalizeInstruments(value);
        if (field !== "instruments" && Array.isArray(defaultValue) && Array.isArray(value)) {
            const valid = field === "tempo" ? value.filter(point => point && typeof point === "object" && "bpm" in point && typeof point.id === "string" && Number.isFinite(point.time) && point.time >= 0 && Number.isFinite(point.bpm) && point.bpm > 0)
                : value.filter(region => region && typeof region === "object" && "start" in region && typeof region.id === "string" && typeof region.label === "string" && Number.isFinite(region.start) && region.start >= 0 && Number.isFinite(region.end) && region.end >= region.start);
            Object.assign(next.values, { [field]: structuredClone(valid) });
        }
        if (saved.sources?.[field] === "user" || saved.sources?.[field] === "musicxml") next.sources[field] = saved.sources[field];
    }
    if (saved.inferred && typeof saved.inferred.scoreKey === "string" && typeof saved.inferred.fileName === "string" && saved.inferred.values && typeof saved.inferred.values === "object") {
        const normalized = restoreMetadata({ values: saved.inferred.values as MusicMetadataValues, sources: {} });
        const fields = Object.keys(saved.inferred.values).filter(field => Object.hasOwn(EMPTY_METADATA, field)) as MetadataField[];
        next.inferred = { scoreKey: saved.inferred.scoreKey, fileName: saved.inferred.fileName, values: Object.fromEntries(fields.map(field => [field, normalized.values[field]])) };
    }
    return next;
}

export function mergeScoreMetadata(current: MusicMetadata, inferred: NonNullable<MusicMetadata["inferred"]>, overwrite: MetadataField[] = []): MusicMetadata {
    const next = structuredClone(current);
    next.inferred = structuredClone(inferred);
    for (const key of Object.keys(inferred.values) as MetadataField[]) {
        if ((next.sources[key] === "user" || (!next.sources[key] && hasMetadataValue(next.values[key]))) && !overwrite.includes(key)) continue;
        const value = inferred.values[key];
        if (!hasMetadataValue(value) && next.sources[key] !== "musicxml") continue;
        Object.assign(next.values, { [key]: structuredClone(value) });
        next.sources[key] = "musicxml";
    }
    return next;
}
