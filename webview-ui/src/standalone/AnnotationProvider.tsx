import { FunctionComponent, PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AudioEditor from "../core/AudioEditor";
import { AnnotationContext, AnnotationSuggestion } from "../annotations/AnnotationContext";
import { ANNOTATION_SCHEMA_VERSION, AnnotationDocument, AnnotationFamily, AnnotationState, AudioAnnotation, isAnnotationDocument, normalizeAnnotationFamily, selectionOrCursorRange } from "../annotations/AnnotationModel";
import { loadAnnotationDocument, saveAnnotationDocument } from "./PersistentStorage";

interface Props extends PropsWithChildren {
    assetKey: string;
    fileName: string;
    filePath: string;
    editor: AudioEditor;
}

export async function fingerprintAudio(data: ArrayBuffer): Promise<string> {
    const sampleSize = Math.min(data.byteLength, 256 * 1024);
    const sample = new Uint8Array(8 + sampleSize * 2);
    new DataView(sample.buffer).setFloat64(0, data.byteLength, true);
    sample.set(new Uint8Array(data, 0, sampleSize), 8);
    sample.set(new Uint8Array(data, data.byteLength - sampleSize, sampleSize), 8 + sampleSize);
    const digest = await crypto.subtle.digest("SHA-256", sample);
    return `audio-sample-v1:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

const AnnotationProvider: FunctionComponent<Props> = ({ assetKey, fileName, filePath, editor, children }) => {
    const [annotations, setAnnotations] = useState<AudioAnnotation[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const saveQueue = useRef(Promise.resolve());

    useEffect(() => {
        let active = true;
        loadAnnotationDocument<AnnotationDocument>(assetKey).then(document => {
            if (!active) return;
            if (document && (!isAnnotationDocument(document) || document.sampleRate !== editor.sampleRate || document.sampleCount !== editor.length)) {
                setError("Saved annotations do not match this audio or use an unsupported format. Nothing was overwritten.");
                return;
            }
            setAnnotations(document?.annotations ?? []);
            setReady(true);
        }).catch(reason => active && setError(`Could not load annotations: ${String(reason)}`));
        return () => { active = false; };
    }, [assetKey, editor]);

    useEffect(() => {
        if (!ready) return;
        const document: AnnotationDocument = {
            schemaVersion: ANNOTATION_SCHEMA_VERSION, assetKey, fileName, filePath,
            sampleRate: editor.sampleRate, sampleCount: editor.length,
            annotations, updatedAt: new Date().toISOString()
        };
        saveQueue.current = saveQueue.current.catch(() => undefined).then(() => saveAnnotationDocument(assetKey, document));
        void saveQueue.current.catch(reason => setError(`Could not save annotations: ${String(reason)}`));
    }, [annotations, assetKey, editor, fileName, filePath, ready]);

    const addManual = useCallback((family: AnnotationFamily, label: string, note: string) => {
        if (!ready || !label.trim()) return null;
        const [startSample, endSample] = selectionOrCursorRange(editor.state.selRange, editor.state.playhead, editor.sampleRate, editor.length);
        const now = new Date().toISOString();
        const record: AudioAnnotation = {
            id: crypto.randomUUID(), startSample, endSample, family, label: label.trim(), note: note.trim(),
            state: "confirmed", provenance: "human", createdAt: now, updatedAt: now
        };
        setAnnotations(previous => [...previous, record]);
        setSelectedId(record.id);
        return record;
    }, [editor, ready]);

    const addSuggestion = useCallback((suggestion: AnnotationSuggestion) => {
        if (!ready || !suggestion.label.trim()) return;
        const startSample = Math.max(0, Math.min(editor.length - 1, Math.round(suggestion.startSeconds * editor.sampleRate)));
        const endSample = Math.max(startSample + 1, Math.min(editor.length, Math.round(suggestion.endSeconds * editor.sampleRate)));
        const existing = annotations.find(item => item.startSample === startSample && item.endSample === endSample &&
            item.labelId === suggestion.labelId && item.label === suggestion.label && item.evidence?.providerId === suggestion.providerId);
        if (existing) { setSelectedId(existing.id); return; }
        const now = new Date().toISOString();
        const record: AudioAnnotation = {
            id: crypto.randomUUID(), startSample, endSample, family: normalizeAnnotationFamily(suggestion.family),
            label: suggestion.label.trim(), labelId: suggestion.labelId, note: "", state: "suggested", provenance: "model",
            evidence: { kind: "audio-text-similarity", providerId: suggestion.providerId, score: suggestion.score, prompt: suggestion.prompt },
            createdAt: now, updatedAt: now
        };
        setAnnotations(previous => [...previous, record]);
        setSelectedId(record.id);
    }, [annotations, editor, ready]);

    const update = useCallback((id: string, changes: Partial<Pick<AudioAnnotation, "startSample" | "endSample" | "family" | "label" | "note" | "state">>) => {
        if (!ready) return;
        setAnnotations(previous => previous.map(item => {
            if (item.id !== id) return item;
            const next = { ...item, ...changes, updatedAt: new Date().toISOString() };
            if (!next.label.trim() || next.label.length > 200 || next.note.length > 5000 ||
                !Number.isInteger(next.startSample) || !Number.isInteger(next.endSample) ||
                next.startSample < 0 || next.endSample <= next.startSample || next.endSample > editor.length) return item;
            return next;
        }));
    }, [editor, ready]);

    const remove = useCallback((id: string) => {
        if (!ready) return;
        setAnnotations(previous => previous.filter(item => item.id !== id));
        setSelectedId(previous => previous === id ? null : previous);
    }, [ready]);

    const setState = useCallback((id: string, state: AnnotationState) => update(id, { state }), [update]);
    const focus = useCallback((id: string) => {
        const item = annotations.find(record => record.id === id);
        if (!item) return;
        setSelectedId(id);
        const [viewStart, viewEnd] = editor.state.viewRange;
        if (item.startSample < viewStart || item.endSample > viewEnd) {
            const span = Math.max(item.endSample - item.startSample, viewEnd - viewStart);
            const start = Math.max(0, Math.min(editor.length - span, Math.round((item.startSample + item.endSample - span) / 2)));
            editor.setViewRange([start, Math.min(editor.length, start + span)]);
        }
        editor.setSelRange([item.startSample, item.endSample]);
    }, [annotations, editor]);

    const exportJson = useCallback(() => {
        const annotationDocument: AnnotationDocument = {
            schemaVersion: ANNOTATION_SCHEMA_VERSION, assetKey, fileName, filePath,
            sampleRate: editor.sampleRate, sampleCount: editor.length,
            annotations, updatedAt: new Date().toISOString()
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(annotationDocument, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileName.replace(/\.[^.]+$/, "")}.annotations.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, [annotations, assetKey, editor, fileName, filePath]);

    const importJson = useCallback(async (file: File) => {
        if (!ready) throw new Error("Annotations are still loading.");
        if (file.size > 10 * 1024 * 1024) throw new Error("Annotation JSON is larger than 10 MB.");
        const imported: unknown = JSON.parse(await file.text());
        if (!isAnnotationDocument(imported) || imported.assetKey !== assetKey ||
            imported.sampleRate !== editor.sampleRate || imported.sampleCount !== editor.length) {
            throw new Error("This annotation file does not match the open audio or uses an unsupported format.");
        }
        const existingIds = new Set(annotations.map(item => item.id));
        const additions = imported.annotations.filter(item => {
            if (existingIds.has(item.id)) return false;
            existingIds.add(item.id);
            return true;
        });
        setAnnotations(previous => [...previous, ...additions]);
        return additions.length;
    }, [annotations, assetKey, editor, ready]);

    const value = useMemo(() => ({
        ready, error, annotations, selectedId, select: setSelectedId,
        addManual, addSuggestion, update, remove, setState, focus, exportJson, importJson
    }), [ready, error, annotations, selectedId, addManual, addSuggestion, update, remove, setState, focus, exportJson, importJson]);

    return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
};

export default AnnotationProvider;
