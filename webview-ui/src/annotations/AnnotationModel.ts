export const ANNOTATION_SCHEMA_VERSION = 1;

export type AnnotationFamily = "instrument" | "technique" | "voice" | "pitch" | "rhythm" | "dynamics" | "timbre" | "harmony" | "form" | "affect" | "production" | "texture" | "genre" | "acoustics" | "other";
export type AnnotationState = "suggested" | "confirmed" | "rejected" | "ambiguous";

export interface AudioAnnotation {
    id: string;
    startSample: number;
    endSample: number;
    family: AnnotationFamily;
    label: string;
    labelId?: string;
    note: string;
    state: AnnotationState;
    provenance: "human" | "model" | "import";
    evidence?: {
        kind: "audio-text-similarity";
        providerId: string;
        score: number;
        prompt?: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface AnnotationDocument {
    schemaVersion: 1;
    assetKey: string;
    fileName: string;
    filePath?: string;
    sampleRate: number;
    sampleCount: number;
    annotations: AudioAnnotation[];
    updatedAt: string;
}

export const ANNOTATION_FAMILIES: { id: AnnotationFamily; name: string }[] = [
    { id: "instrument", name: "乐器" }, { id: "technique", name: "演奏法" },
    { id: "voice", name: "人声" }, { id: "pitch", name: "音高" },
    { id: "rhythm", name: "节奏" }, { id: "dynamics", name: "力度" },
    { id: "timbre", name: "音色" }, { id: "harmony", name: "和声" },
    { id: "form", name: "曲式" }, { id: "affect", name: "情绪" },
    { id: "production", name: "制作" }, { id: "texture", name: "织体" },
    { id: "genre", name: "风格" }, { id: "acoustics", name: "声学" },
    { id: "other", name: "其他" }
];

const families = new Set<string>(ANNOTATION_FAMILIES.map(item => item.id));
const states = new Set<string>(["suggested", "confirmed", "rejected", "ambiguous"]);

export function normalizeAnnotationFamily(value: string): AnnotationFamily {
    return families.has(value) ? value as AnnotationFamily : "other";
}

export function isAnnotationDocument(value: unknown): value is AnnotationDocument {
    if (!value || typeof value !== "object") return false;
    const document = value as Partial<AnnotationDocument>;
    if (document.schemaVersion !== ANNOTATION_SCHEMA_VERSION || typeof document.assetKey !== "string" ||
        typeof document.fileName !== "string" || document.fileName.length > 500 ||
        (document.filePath !== undefined && (typeof document.filePath !== "string" || document.filePath.length > 32768)) ||
        !Number.isInteger(document.sampleRate) || document.sampleRate! <= 0 ||
        !Number.isInteger(document.sampleCount) || document.sampleCount! <= 0 ||
        typeof document.updatedAt !== "string" || !Array.isArray(document.annotations) || document.annotations.length > 50000) return false;
    return document.annotations.every(item => item && typeof item.id === "string" &&
        Number.isInteger(item.startSample) && Number.isInteger(item.endSample) &&
        item.startSample >= 0 && item.endSample > item.startSample && item.endSample <= document.sampleCount! &&
        typeof item.label === "string" && item.label.length <= 200 && typeof item.note === "string" && item.note.length <= 5000 &&
        families.has(item.family) && states.has(item.state) &&
        ["human", "model", "import"].includes(item.provenance) &&
        (item.labelId === undefined || typeof item.labelId === "string") &&
        typeof item.createdAt === "string" && typeof item.updatedAt === "string" &&
        (item.evidence === undefined || (item.evidence && typeof item.evidence === "object" && item.evidence.kind === "audio-text-similarity" &&
            typeof item.evidence.providerId === "string" && Number.isFinite(item.evidence.score) &&
            (item.evidence.prompt === undefined || typeof item.evidence.prompt === "string"))));
}

export function selectionOrCursorRange(
    selection: [number, number] | null, playhead: number, sampleRate: number, sampleCount: number
): [number, number] {
    if (selection && selection[1] > selection[0]) return selection;
    const radius = Math.max(1, Math.round(sampleRate * 0.125));
    const start = Math.max(0, Math.min(sampleCount - 1, playhead - radius));
    return [start, Math.min(sampleCount, Math.max(start + 1, playhead + radius))];
}
