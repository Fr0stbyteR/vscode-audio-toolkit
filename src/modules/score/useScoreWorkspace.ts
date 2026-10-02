import { useEffect, useMemo, useRef, useState } from "react";
import { AlignmentPoint, alignScoreToAudio, alignmentPoints, prepareAudioSamples, audioTimeAtScore } from "./Alignment";
import { mergeScoreMetadata, MusicMetadataValues } from "../../core/MusicMetadata";
import { importScore, loadScore, ParsedScore } from "./ScoreLibrary";
import type { ScoreState } from "./ScoreModule";
import { updateSharedScoreState } from "./ScoreModule";
import AudioEditor from "../../core/AudioEditor";

interface ScoreModuleLike { audioEditor: AudioEditor; getState(): ScoreState; setState(state: ScoreState): void; }

export function useScoreWorkspace(module: ScoreModuleLike, state: ScoreState) {
    const [score, setScore] = useState<ParsedScore>();
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const recognition = useRef<AbortController>();
    const [omrProgress, setOmrProgress] = useState<{ progress: number | null; message: string }>();
    useEffect(() => () => recognition.current?.abort(), []);
    useEffect(() => {
        if (!state.scoreKey) { setScore(undefined); return; }
        let active = true;
        setBusy("Loading score"); setError(""); setScore(undefined);
        loadScore(state.scoreKey).then(value => { if (active) setScore(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (active) setBusy(""); });
        return () => { active = false; };
    }, [state.scoreKey]);
    const audioKey = module.audioEditor.uri || `${module.audioEditor.sampleRate}:${module.audioEditor.length}`;
    const currentAutoAlignment = useMemo(() => state.alignmentAudioKey === audioKey ? state.autoAlignment : [], [audioKey, state.alignmentAudioKey, state.autoAlignment]);
    const currentManualAnchors = useMemo(() => state.alignmentAudioKey === audioKey ? state.manualAnchors : [], [audioKey, state.alignmentAudioKey, state.manualAnchors]);
    const currentState = state.alignmentAudioKey === audioKey ? state : { ...state, autoAlignment: [], manualAnchors: [] };
    const alignment = useMemo(() => score ? alignmentPoints(currentAutoAlignment, currentManualAnchors, score.duration, module.audioEditor.duration) : [], [module.audioEditor.duration, score, currentAutoAlignment, currentManualAnchors]);
    useEffect(() => {
        if (!score?.metadata || !alignment.length) return;
        const values: Partial<MusicMetadataValues> = structuredClone(score.metadata);
        const audioTime = (time: number) => Math.round(audioTimeAtScore(alignment, time) * 1000) / 1000;
        for (const field of ["form", "keys", "meters"] as const) values[field] = values[field]?.map(region => ({ ...region, start: audioTime(region.start), end: audioTime(region.end) }));
        values.tempo = values.tempo?.map(point => ({ ...point, time: audioTime(point.time) }));
        const inferred = { scoreKey: state.scoreKey, fileName: score.name, values };
        const editor = module.audioEditor;
        if (JSON.stringify(editor.metadata.inferred) !== JSON.stringify(inferred)) editor.setMetadata(mergeScoreMetadata(editor.metadata, inferred));
    }, [score, alignment, state.scoreKey, module.audioEditor]);
    const importFile = async (file: File, omrWarnings: string[] = []) => {
        setBusy("Importing score"); setError("");
        try {
            const imported = await importScore(file);
            const previousKey = module.getState().scoreKey;
            const update = { scoreKey: imported.key, fileName: imported.name, format: imported.format, alignmentAudioKey: audioKey, autoAlignment: [], manualAnchors: [], hiddenTracks: [], omrWarnings };
            module.setState({ ...module.getState(), ...update });
            if (previousKey) updateSharedScoreState(module.audioEditor, previousKey, update);
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { setBusy(""); }
    };
    const recognizeFile = async (file: File) => {
        recognition.current?.abort();
        const controller = recognition.current = new AbortController();
        setBusy("Recognizing score"); setError(""); setOmrProgress({ progress: 0, message: "Preparing score recognition" });
        try {
            const result = await module.audioEditor.recognizeScore(file, progress => { if (!controller.signal.aborted) setOmrProgress(progress); }, controller.signal);
            if (controller.signal.aborted) return;
            await importFile(new File([result.musicxml], result.name, { type: "application/vnd.recordare.musicxml+xml" }), result.warnings);
        } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { if (recognition.current === controller) { setBusy(""); setOmrProgress(undefined); } }
    };
    const cancelRecognition = () => { recognition.current?.abort(); setBusy(""); setOmrProgress(undefined); };
    const autoAlign = async () => {
        if (!score || !score.notes.length) return;
        setBusy("Preparing audio chroma"); setError("");
        try {
            const editor = module.audioEditor;
            const channels = Array.from({ length: Math.min(editor.numberOfChannels, 2) }, (_, index) => editor.audioBuffer.getChannelData(index));
            const samples = prepareAudioSamples(channels, editor.sampleRate);
            const points = await alignScoreToAudio(samples, score.notes, editor.duration, score.duration, setBusy);
            updateSharedScoreState(editor, state.scoreKey, { alignmentAudioKey: audioKey, autoAlignment: points, manualAnchors: currentManualAnchors });
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { setBusy(""); }
    };
    const addAnchor = (scoreTime: number, audioTime: number) => {
        if (!score || !state.scoreKey) return;
        const anchor: AlignmentPoint = { scoreTime: Math.max(0, Math.min(score.duration, scoreTime)), audioTime: Math.max(0, Math.min(module.audioEditor.duration, audioTime)) };
        const manualAnchors = [...currentManualAnchors.filter(point => Math.abs(point.scoreTime - scoreTime) > 0.05), anchor].sort((a, b) => a.scoreTime - b.scoreTime);
        const position = manualAnchors.indexOf(anchor);
        if ((position > 0 && manualAnchors[position - 1].audioTime >= anchor.audioTime) ||
            (position < manualAnchors.length - 1 && manualAnchors[position + 1].audioTime <= anchor.audioTime)) {
            setError("Anchors must follow the same order in score and audio."); return;
        }
        setError("");
        updateSharedScoreState(module.audioEditor, state.scoreKey, { alignmentAudioKey: audioKey, autoAlignment: currentAutoAlignment, manualAnchors });
    };
    const clearAnchors = () => { if (state.scoreKey) updateSharedScoreState(module.audioEditor, state.scoreKey, { alignmentAudioKey: audioKey, autoAlignment: currentAutoAlignment, manualAnchors: [] }); };
    return { score, busy, error, alignment, currentState, importFile, recognizeFile, cancelRecognition, omrProgress, autoAlign, addAnchor, clearAnchors, setError };
}
