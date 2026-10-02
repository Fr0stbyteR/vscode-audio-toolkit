import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import { getVisualizerRulerWidth, VisualizationOptions } from "../../core/AudioToolkitModule";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import { setCanvasToFullSize } from "../../utils";
import { audioTimeAtScore } from "./Alignment";
import { PianoRoll } from "./ScoreModule";
import { useScoreWorkspace } from "./useScoreWorkspace";
import ScoreControls from "./ScoreControls";
import ScoreImportActions from "./ScoreImportActions";
import ModuleEmptyState from "../../components/ModuleEmptyState";
import { ScoreNote } from "./ScoreLibrary";
import { useLocale } from "../../i18n/LocaleContext";
import "./ScoreModules.scss";

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const pitchName = (pitch: number) => `${PITCH_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;

const PianoRollComponent: FunctionComponent<VisualizationOptions<PianoRoll>> = props => {
    const { t } = useLocale();
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration, playhead, activeLayer, configurationMode } = props;
    const { score, busy, error, alignment, currentState, importFile, autoAlign, addAnchor, clearAnchors } = useScoreWorkspace(module, moduleState);
    const [selectedNote, setSelectedNote] = useState<ScoreNote>();
    const [verticalZoom, setVerticalZoom] = useState(1);
    const [verticalOffset, setVerticalOffset] = useState(0);
    useEffect(() => setSelectedNote(undefined), [moduleState.scoreKey]);
    const pitchRange = useMemo(() => {
        if (!score?.notes.length) return [48, 84] as const;
        let low = 127, high = 0;
        for (const note of score.notes) { low = Math.min(low, note.pitch); high = Math.max(high, note.pitch); }
        return [Math.max(0, low - 2), Math.min(127, high + 2)] as const;
    }, [score]);
    const rowGeometry = useCallback((height: number) => ({
        rowHeight: Math.max(2, height / Math.max(12, pitchRange[1] - pitchRange[0] + 1) * verticalZoom),
        center: (pitchRange[0] + pitchRange[1]) / 2 + verticalOffset * 10
    }), [pitchRange, verticalOffset, verticalZoom]);
    const noteY = useCallback((pitch: number, height: number) => {
        const { rowHeight, center } = rowGeometry(height);
        return height / 2 - (pitch - center + 0.5) * rowHeight;
    }, [rowGeometry]);
    const paint = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current, ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--vscode-editor-background") || "#1e1e1e";
        ctx.fillRect(0, 0, width, height);
        if (!score) return;
        const { rowHeight } = rowGeometry(height);
        for (let pitch = pitchRange[0]; pitch <= pitchRange[1]; pitch++) {
            const y = noteY(pitch, height);
            if (y < -rowHeight || y > height) continue;
            const pitchClass = pitch % 12;
            ctx.fillStyle = selectedNote?.pitch === pitch ? "rgba(90, 150, 215, .17)"
                : pitchClass === 0 ? "rgba(110, 150, 190, .12)"
                : BLACK_KEYS.has(pitchClass) ? "rgba(0, 0, 0, .16)" : "rgba(255, 255, 255, .025)";
            ctx.fillRect(0, y, width, rowHeight);
            ctx.strokeStyle = pitchClass === 0 ? "rgba(130, 155, 180, .35)" : "rgba(130, 155, 180, .09)";
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }
        const [start, end] = viewRange;
        const span = Math.max(1, end - start);
        const rate = module.audioEditor.sampleRate;
        for (const event of score.events) {
            if (event.kind !== "measure") continue;
            const x = (audioTimeAtScore(alignment, event.time) * rate - start) / span * width;
            if (x < 0 || x > width) continue;
            ctx.strokeStyle = "rgba(180, 190, 205, .26)";
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        const trackColors = new Map(score.tracks.map(track => [track.id, track.color]));
        for (const note of score.notes) {
            if (moduleState.hiddenTracks.includes(note.trackId)) continue;
            const startX = (audioTimeAtScore(alignment, note.time) * rate - start) / span * width;
            const endX = (audioTimeAtScore(alignment, note.time + note.duration) * rate - start) / span * width;
            if (endX < 0 || startX > width) continue;
            const y = noteY(note.pitch, height);
            if (y < -rowHeight || y > height) continue;
            ctx.fillStyle = trackColors.get(note.trackId) || "#4b83d1";
            ctx.globalAlpha = selectedNote?.id === note.id ? 1 : 0.8;
            ctx.fillRect(startX, y + 1, Math.max(2, endX - startX), Math.max(2, rowHeight - 2));
            ctx.globalAlpha = 1;
            if (selectedNote?.id === note.id) { ctx.strokeStyle = "#ffffff"; ctx.strokeRect(startX, y + 1, Math.max(2, endX - startX), Math.max(2, rowHeight - 2)); }
        }
    }, [alignment, module.audioEditor.sampleRate, moduleState.hiddenTracks, noteY, pitchRange, rowGeometry, score, selectedNote?.id, selectedNote?.pitch, viewRange]);
    const paintVerticalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [configuration, gridColor, module.audioEditor.sampleRate, viewRange]);
    const paintHorizontalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        const rulerWidth = Math.min(width, getVisualizerRulerWidth(canvas));
        const rulerLeft = width - rulerWidth;
        const keyWidth = Math.min(42, Math.max(24, rulerWidth - 24));
        const labelX = rulerLeft + keyWidth + 5;
        ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--vscode-panel-background") || "#181818";
        ctx.fillRect(rulerLeft, 0, rulerWidth, height);
        const { rowHeight } = rowGeometry(height);
        ctx.save();
        ctx.beginPath(); ctx.rect(rulerLeft, 0, rulerWidth, height); ctx.clip();
        ctx.font = `10px ${monospaceFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = gridRulerColor;
        ctx.beginPath(); ctx.moveTo(rulerLeft + .5, 0); ctx.lineTo(rulerLeft + .5, height); ctx.stroke();
        for (let pitch = pitchRange[0]; pitch <= pitchRange[1]; pitch++) {
            const y = noteY(pitch, height);
            if (y + rowHeight <= 0 || y >= height) continue;
            const black = BLACK_KEYS.has(pitch % 12);
            ctx.fillStyle = black ? "#252b33" : "#c8cdd2";
            ctx.fillRect(rulerLeft + 1, y, black ? keyWidth * .68 : keyWidth, rowHeight);
            if (!black) {
                ctx.strokeStyle = "rgba(30, 35, 42, .45)";
                ctx.strokeRect(rulerLeft + 1.5, y + .5, keyWidth - 1, Math.max(1, rowHeight - 1));
            }
            if (rowHeight >= 12 || pitch % 12 === 0) {
                const centerY = y + rowHeight / 2;
                if (centerY >= 6 && centerY <= height - 6) {
                    ctx.fillStyle = pitch % 12 === 0 ? textColor : "#aeb6bf";
                    ctx.fillText(pitchName(pitch), labelX, centerY, Math.max(0, rulerWidth - keyWidth - 6));
                }
            }
        }
        if (selectedNote && selectedNote.pitch >= pitchRange[0] && selectedNote.pitch <= pitchRange[1]) {
            const y = noteY(selectedNote.pitch, height);
            const centerY = y + rowHeight / 2;
            if (centerY >= 6 && centerY <= height - 6) {
                ctx.strokeStyle = "#69b7f1";
                ctx.strokeRect(rulerLeft + 1.5, y + .5, keyWidth - 1, Math.max(1, rowHeight - 1));
                ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--vscode-panel-background") || "#181818";
                ctx.fillRect(labelX - 2, centerY - 6, rulerWidth - keyWidth - 3, 12);
                ctx.fillStyle = "#69b7f1";
                ctx.fillText(pitchName(selectedNote.pitch), labelX, centerY, Math.max(0, rulerWidth - keyWidth - 6));
            }
        }
        ctx.restore();
    }, [gridRulerColor, monospaceFont, noteY, pitchRange, rowGeometry, selectedNote, textColor]);
    const onCanvasMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>, rect: DOMRect) => {
        if (!score) return false;
        const rate = module.audioEditor.sampleRate;
        const audioTime = (viewRange[0] + (event.clientX - rect.left) / rect.width * (viewRange[1] - viewRange[0])) / rate;
        const { rowHeight } = rowGeometry(rect.height);
        const pitch = Math.round(rowGeometry(rect.height).center + (rect.height / 2 - (event.clientY - rect.top)) / rowHeight - 0.5);
        const found = score.notes.find(note => !moduleState.hiddenTracks.includes(note.trackId) && note.pitch === pitch &&
            audioTime >= audioTimeAtScore(alignment, note.time) && audioTime <= audioTimeAtScore(alignment, note.time + note.duration));
        if (!found) return false;
        setSelectedNote(found);
        if (!event.altKey) module.audioEditor.setPlayhead(Math.round(audioTimeAtScore(alignment, found.time) * rate));
        return true;
    }, [alignment, module.audioEditor, moduleState.hiddenTracks, rowGeometry, score, viewRange]);
    const setTrackVisibility = (trackId: string, visible: boolean) => module.setState({ ...moduleState, hiddenTracks: visible ? moduleState.hiddenTracks.filter(id => id !== trackId) : [...moduleState.hiddenTracks, trackId] });
    const addCompanion = () => { if (score?.format !== "midi") void module.audioEditor.addModule("score.musicxml", { ...moduleState }, "MusicXML score", true); };
    const monitorContent = selectedNote ? <div className="default-layout"><div>{t("Pitch")}: {pitchName(selectedNote.pitch)} (MIDI {selectedNote.pitch})</div><div>{t("Instrument")}: {score?.tracks.find(track => track.id === selectedNote.trackId)?.name}</div><div>{t("Score time")}: {selectedNote.time.toFixed(2)} s</div><div>{t("Audio time")}: {audioTimeAtScore(alignment, selectedNote.time).toFixed(2)} s</div></div> : undefined;
    return <>
        <ModuleUsingCanvas {...props} defaultVerticalZoom={1} verticalZoom={verticalZoom} setVerticalZoom={setVerticalZoom} defaultVerticalOffset={0} verticalOffset={verticalOffset} setVerticalOffset={setVerticalOffset} paint={paint} paintVerticalRuler={paintVerticalRuler} paintHorizontalRuler={paintHorizontalRuler} onCanvasMouseDown={onCanvasMouseDown} monitorContent={monitorContent} />
        {!score && (!props.overlayMode || activeLayer) ? <ModuleEmptyState message={error ? <span role="alert">{t(error)}</span> : busy ? `${t(busy)}…` : undefined}><ScoreImportActions kind="pianoroll" busy={!!busy} onImport={file => void importFile(file)} /></ModuleEmptyState> : null}
        <ScoreControls state={currentState} score={score} busy={busy} error={error} selectedTime={selectedNote?.time} playheadSeconds={playhead / module.audioEditor.sampleRate} mode={configurationMode} activeLayer={activeLayer} moduleKind="pianoroll" onImport={file => void importFile(file)} onAutoAlign={() => void autoAlign()} onAnchor={addAnchor} onClearAnchors={clearAnchors} onAddCompanion={addCompanion} onTrackVisibility={setTrackVisibility} />
    </>;
};

export default PianoRollComponent;
