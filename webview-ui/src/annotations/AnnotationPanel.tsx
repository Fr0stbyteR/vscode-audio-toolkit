import { FunctionComponent, useContext, useEffect, useMemo, useRef, useState } from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { AudioEditorContext } from "../components/contexts";
import { AnnotationContext } from "./AnnotationContext";
import { ANNOTATION_FAMILIES, AnnotationFamily, AnnotationState, AudioAnnotation } from "./AnnotationModel";
import "./AnnotationPanel.scss";
import { useLocale } from "../i18n/LocaleContext";

const formatTime = (samples: number, rate: number) => (samples / rate).toFixed(2);

const AnnotationPanel: FunctionComponent = () => {
    const { t } = useLocale();
    const familyName = (family: AnnotationFamily) => t(family);
    const session = useContext(AnnotationContext);
    const editor = useContext(AudioEditorContext);
    const [newOpen, setNewOpen] = useState(false);
    const [newFamily, setNewFamily] = useState<AnnotationFamily>("instrument");
    const [newLabel, setNewLabel] = useState("");
    const [newNote, setNewNote] = useState("");
    const [filter, setFilter] = useState<AnnotationState | "all">("all");
    const [message, setMessage] = useState("");
    const [cursor, setCursor] = useState(0);
    const [selection, setSelection] = useState<[number, number] | null>(null);
    const [draft, setDraft] = useState({ label: "", family: "instrument" as AnnotationFamily, start: "0", end: "0", note: "" });
    const importRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!editor) return;
        setCursor(editor.state.playhead);
        setSelection(editor.state.selRange);
        editor.on("playhead", setCursor);
        editor.on("selRange", setSelection);
        return () => { editor.off("playhead", setCursor); editor.off("selRange", setSelection); };
    }, [editor]);

    const selected = session?.annotations.find(item => item.id === session.selectedId);
    useEffect(() => {
        if (!selected || !editor) return;
        setDraft({ label: selected.label, family: selected.family, start: formatTime(selected.startSample, editor.sampleRate),
            end: formatTime(selected.endSample, editor.sampleRate), note: selected.note });
    }, [selected, editor]);

    const visible = useMemo(() => (session?.annotations ?? [])
        .filter(item => filter === "all" || item.state === filter)
        .sort((a, b) => a.startSample - b.startSample || a.endSample - b.endSample), [session?.annotations, filter]);
    if (!session || !editor) return null;

    const create = () => {
        const record = session.addManual(newFamily, newLabel, newNote);
        if (!record) { setMessage("Enter a label before adding an annotation."); return; }
        setNewLabel(""); setNewNote(""); setNewOpen(false); setMessage("");
    };
    const save = () => {
        if (!selected) return false;
        const startSample = Math.round(Number(draft.start) * editor.sampleRate);
        const endSample = Math.round(Number(draft.end) * editor.sampleRate);
        if (!draft.label.trim() || !Number.isFinite(startSample) || !Number.isFinite(endSample) ||
            startSample < 0 || endSample <= startSample || endSample > editor.length) {
            setMessage("Check the label and time interval before saving."); return false;
        }
        session.update(selected.id, { label: draft.label.trim(), family: draft.family, startSample, endSample, note: draft.note.trim() });
        setMessage("Annotation saved locally.");
        return true;
    };
    const changeState = (state: AnnotationState) => {
        if (!selected) return;
        if (!save()) return;
        session.setState(selected.id, state);
        setMessage(state === "confirmed" ? "Confirmed as human-reviewed." : state === "rejected" ? "Rejected; retained for feedback export." : "Marked for review.");
    };
    const importFile = async (file?: File) => {
        if (!file) return;
        try { setMessage(`Imported ${await session.importJson(file)} annotations.`); }
        catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
        if (importRef.current) importRef.current.value = "";
    };
    const rangeText = selection && selection[1] > selection[0]
        ? `${t("Selection")} ${formatTime(selection[0], editor.sampleRate)}–${formatTime(selection[1], editor.sampleRate)} s`
        : `${t("Cursor")} ${formatTime(cursor, editor.sampleRate)} s · ${t("new marks span 0.25 s")}`;

    return <div className="annotation-panel">
        <div className="annotation-toolbar">
            <strong>{t("Annotations")} <span>{session.annotations.length}</span></strong>
            <VSCodeButton appearance="icon" title={t("New annotation")} aria-label={t("New annotation")} onClick={() => { session.select(null); setNewOpen(value => !value); }}><span className="codicon codicon-add" /></VSCodeButton>
            <VSCodeButton appearance="icon" title={t("Export annotation JSON")} aria-label={t("Export annotation JSON")} onClick={session.exportJson} disabled={!session.ready}><span className="codicon codicon-export" /></VSCodeButton>
            <VSCodeButton appearance="icon" title={t("Import matching annotation JSON")} aria-label={t("Import annotation JSON")} onClick={() => importRef.current?.click()} disabled={!session.ready}><span className="codicon codicon-cloud-upload" /></VSCodeButton>
            <input ref={importRef} className="annotation-file-input" type="file" accept=".json,application/json" onChange={event => void importFile(event.target.files?.[0])} />
        </div>
        <div className="annotation-range" title={t("A selection becomes the annotation interval. Without one, a short interval is centered on the cursor.")}>{rangeText}</div>
        {session.error ? <p className="annotation-message error">{session.error}</p> : null}
        {!session.ready && !session.error ? <p className="annotation-message">{t("Loading saved annotations…")}</p> : null}
        {message ? <p className="annotation-message" role="status">{t(message)}</p> : null}
        {newOpen && session.ready ? <div className="annotation-edit">
            <label>{t("Family")}<select value={newFamily} onChange={event => setNewFamily(event.target.value as AnnotationFamily)}>{ANNOTATION_FAMILIES.map(item => <option key={item.id} value={item.id}>{t(item.id)}</option>)}</select></label>
            <label>{t("Label")}<input autoFocus value={newLabel} maxLength={200} onChange={event => setNewLabel(event.target.value)} onKeyDown={event => { if (event.key === "Enter") create(); }} placeholder="e.g. sul ponticello" /></label>
            <label>{t("Note")}<textarea value={newNote} maxLength={5000} onChange={event => setNewNote(event.target.value)} rows={2} /></label>
            <VSCodeButton appearance="primary" onClick={create}>{t("Add confirmed annotation")}</VSCodeButton>
        </div> : null}
        {selected ? <div className="annotation-edit annotation-selected">
            <div className="annotation-selected-heading"><span className={`annotation-state ${selected.state}`}>{t(selected.state)}</span><span>{t(selected.provenance === "human" ? "Human" : selected.provenance === "model" ? "Model suggestion" : "Imported")}</span></div>
            <label>{t("Label")}<input value={draft.label} maxLength={200} onChange={event => setDraft(value => ({ ...value, label: event.target.value }))} /></label>
            <label>{t("Family")}<select value={draft.family} onChange={event => setDraft(value => ({ ...value, family: event.target.value as AnnotationFamily }))}>{ANNOTATION_FAMILIES.map(item => <option key={item.id} value={item.id}>{t(item.id)}</option>)}</select></label>
            <div className="annotation-time-fields"><label>{t("Start (s)")}<input type="number" min="0" step="0.01" value={draft.start} onChange={event => setDraft(value => ({ ...value, start: event.target.value }))} /></label><label>{t("End (s)")}<input type="number" min="0" step="0.01" value={draft.end} onChange={event => setDraft(value => ({ ...value, end: event.target.value }))} /></label></div>
            <label>{t("Note")}<textarea value={draft.note} maxLength={5000} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} rows={2} /></label>
            {selected.evidence ? <div className="annotation-evidence">{selected.evidence.providerId} · {t("similarity")} {selected.evidence.score.toFixed(3)} · {t("not a probability")}</div> : null}
            <div className="annotation-actions"><VSCodeButton appearance="secondary" onClick={() => { save(); }}>{t("Save edits")}</VSCodeButton><VSCodeButton appearance="primary" onClick={() => changeState("confirmed")}>{t("Confirm")}</VSCodeButton></div>
            <div className="annotation-actions"><VSCodeButton appearance="secondary" onClick={() => changeState("rejected")}>{t("Reject")}</VSCodeButton><VSCodeButton appearance="secondary" onClick={() => changeState("ambiguous")}>{t("Unsure")}</VSCodeButton><VSCodeButton appearance="icon" title={t("Delete annotation")} aria-label={t("Delete annotation")} onClick={() => { if (window.confirm(t("Delete this annotation? This cannot be undone unless you exported it."))) session.remove(selected.id); }}><span className="codicon codicon-trash" /></VSCodeButton></div>
        </div> : null}
        <label className="annotation-filter">{t("Show")}<select value={filter} onChange={event => setFilter(event.target.value as AnnotationState | "all")}><option value="all">{t("All states")}</option><option value="suggested">{t("Suggestions")}</option><option value="confirmed">{t("Confirmed")}</option><option value="ambiguous">{t("Unsure")}</option><option value="rejected">{t("Rejected")}</option></select></label>
        {visible.length ? <div className="annotation-list">{visible.map((item: AudioAnnotation) => <button key={item.id} type="button" className={`annotation-row ${item.state}${selected?.id === item.id ? " selected" : ""}`} onClick={() => { setNewOpen(false); setMessage(""); session.focus(item.id); }} title={`${familyName(item.family)} · ${formatTime(item.startSample, editor.sampleRate)}–${formatTime(item.endSample, editor.sampleRate)} s`}>
            <span className="annotation-row-top"><span className={`annotation-state ${item.state}`} /><strong>{item.label}</strong><time>{formatTime(item.startSample, editor.sampleRate)} s</time></span>
            <span className="annotation-row-bottom">{familyName(item.family)} · {t(item.state)}{item.evidence ? ` · ${t("similarity")} ${item.evidence.score.toFixed(2)}` : ""}</span>
        </button>)}</div> : <p className="annotation-empty">{session.ready ? t("No annotations in this view. Select a range and add one, or save a CLAP suggestion.") : ""}</p>}
    </div>;
};

export default AnnotationPanel;
