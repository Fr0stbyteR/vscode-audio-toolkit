import { createContext } from "react";
import { AnnotationFamily, AnnotationState, AudioAnnotation } from "./AnnotationModel";

export interface AnnotationSuggestion {
    startSeconds: number;
    endSeconds: number;
    family: string;
    label: string;
    labelId?: string;
    providerId: string;
    score: number;
    prompt?: string;
}

export interface AnnotationSession {
    ready: boolean;
    error: string;
    annotations: AudioAnnotation[];
    selectedId: string | null;
    select(id: string | null): void;
    addManual(family: AnnotationFamily, label: string, note: string): AudioAnnotation | null;
    addSuggestion(suggestion: AnnotationSuggestion): void;
    update(id: string, changes: Partial<Pick<AudioAnnotation, "startSample" | "endSample" | "family" | "label" | "note" | "state">>): void;
    remove(id: string): void;
    setState(id: string, state: AnnotationState): void;
    focus(id: string): void;
    exportJson(): void;
    importJson(file: File): Promise<number>;
}

export const AnnotationContext = createContext<AnnotationSession | null>(null);
