import type { AnnotationDocument } from "../annotations/AnnotationModel";

export interface ReviewBundle {
    kind: "audio-toolkit-review-bundle";
    schemaVersion: 1;
    generatedAt: string;
    purpose: "review-exchange-not-training";
    assetIdentity: "sampled-content-hash-v1";
    summary: { files: number; annotations: number; suggested: number; confirmed: number; rejected: number; ambiguous: number };
    documents: AnnotationDocument[];
}

export function makeReviewBundle(documents: AnnotationDocument[], generatedAt = new Date().toISOString()): ReviewBundle {
    const unique = new Map<string, AnnotationDocument>();
    for (const document of documents) {
        const previous = unique.get(document.assetKey);
        if (!previous || document.updatedAt > previous.updatedAt) unique.set(document.assetKey, document);
    }
    const ordered = [...unique.values()].sort((a, b) => a.filePath?.localeCompare(b.filePath || b.fileName) ?? a.fileName.localeCompare(b.fileName));
    const annotations = ordered.flatMap(document => document.annotations);
    return {
        kind: "audio-toolkit-review-bundle", schemaVersion: 1, generatedAt,
        purpose: "review-exchange-not-training", assetIdentity: "sampled-content-hash-v1",
        summary: {
            files: ordered.length, annotations: annotations.length,
            suggested: annotations.filter(item => item.state === "suggested").length,
            confirmed: annotations.filter(item => item.state === "confirmed").length,
            rejected: annotations.filter(item => item.state === "rejected").length,
            ambiguous: annotations.filter(item => item.state === "ambiguous").length
        },
        documents: ordered
    };
}
