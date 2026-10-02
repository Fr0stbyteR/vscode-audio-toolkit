import { useContext, useEffect, useState } from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { AudioEditorContext } from "./contexts";
import CollapsiblePanel from "./CollapsiblePanel";
import { MetadataField, METADATA_LABELS, MusicMetadata, MusicMetadataValues, hasMetadataValue, mergeScoreMetadata } from "../core/MusicMetadata";
import { useLocale } from "../i18n/LocaleContext";
import type { MusicCurveState } from "../modules/music-features/MusicCurve";

const THEMES = ["Narrative", "Lyrical", "Labor", "Ritual", "Festival", "Love", "History", "Knowledge narration", "Daily life", "Other"];

export default function MusicMetadataPanel() {
    const editor = useContext(AudioEditorContext)!;
    const { t } = useLocale();
    const [metadata, setMetadata] = useState(editor.metadata);
    const [modules, setModules] = useState(editor.modulesState);
    const [overrides, setOverrides] = useState<MetadataField[]>([]);
    const [error, setError] = useState("");
    const [adding, setAdding] = useState(false);
    useEffect(() => {
        const update = (value: MusicMetadata) => { setMetadata(value); setOverrides([]); };
        editor.on("metadata", update); editor.on("modulesState", setModules);
        setMetadata(editor.metadata); setModules(editor.modulesState);
        return () => { editor.off("metadata", update); editor.off("modulesState", setModules); };
    }, [editor]);
    const change = <K extends MetadataField>(field: K, value: MusicMetadataValues[K]) => {
        const current = editor.metadata;
        editor.setMetadata({ ...current, values: { ...current.values, [field]: value }, sources: { ...current.sources, [field]: "user" } });
    };
    const open = async (moduleId: string) => {
        setError(""); setAdding(true);
        try {
            let index = editor.modulesState.findIndex(module => module.moduleId === moduleId);
            if (index < 0) { await editor.addModule(moduleId); index = editor.modulesState.length - 1; }
            editor.focusModule(index);
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { setAdding(false); }
    };
    const textField = (field: "title" | "composer" | "context" | "otherTheme") => <label className="metadata-field"><span className="metadata-field-heading">{t(METADATA_LABELS[field])}</span><input aria-label={t(METADATA_LABELS[field])} value={metadata.values[field]} onChange={event => change(field, event.target.value)} /></label>;
    const summary = (title: string, moduleId: string, content: string) => <div className="metadata-summary"><div><span>{t(title)}</span><small title={content}>{content || "—"}</small></div><VSCodeButton appearance="icon" disabled={adding} title={t(modules.some(module => module.moduleId === moduleId) ? "Open module" : "Add a Module")} aria-label={t(title)} onClick={() => void open(moduleId)}><span className={`codicon codicon-${modules.some(module => module.moduleId === moduleId) ? "go-to-file" : "add"}`} /></VSCodeButton></div>;
    const regions = (field: "form" | "keys" | "meters", id: string) => summary(METADATA_LABELS[field], id, metadata.values[field].map(region => region.label).filter(Boolean).join(" · "));
    const tempo = metadata.values.tempo.map(point => point.bpm);
    const performed = modules.find(module => module.moduleId === "music.performed-tempo");
    const performedValues = (performed?.state as MusicCurveState | undefined)?.points?.map(point => point.values[0]).filter((value): value is number => value !== null && Number.isFinite(value)) ?? [];
    const bpmSummary = (values: number[]) => values.length ? `${Math.min(...values).toFixed(0)}–${Math.max(...values).toFixed(0)} BPM` : "";
    const inferred = metadata.inferred;
    const conflicts = inferred ? (Object.keys(inferred.values) as MetadataField[]).filter(field => hasMetadataValue(inferred.values[field]) && metadata.sources[field] !== "musicxml" && JSON.stringify(metadata.values[field]) !== JSON.stringify(inferred.values[field])) : [];
    return <CollapsiblePanel id="metadata" title="Piece metadata" icon="tag" className="inspector-section metadata-panel">
        {textField("title")}{textField("composer")}
        <div className="metadata-field" role="group" aria-label={t("Instruments")}>
            <span className="metadata-field-heading">{t("Instruments")}<VSCodeButton appearance="icon" title={t("Add instrument")} aria-label={t("Add instrument")} onClick={() => change("instruments", [...editor.metadata.values.instruments, ""])}><span className="codicon codicon-add" /></VSCodeButton></span>
            {metadata.values.instruments.map((instrument, index) => <div className="metadata-instrument-row" key={index}>
                <input aria-label={`${t("Instrument")} ${index + 1}`} value={instrument} onChange={event => change("instruments", editor.metadata.values.instruments.map((value, i) => i === index ? event.target.value : value))} />
                <VSCodeButton appearance="icon" title={t("Remove instrument")} aria-label={`${t("Remove instrument")} ${index + 1}`} onClick={() => change("instruments", editor.metadata.values.instruments.filter((_, i) => i !== index))}><span className="codicon codicon-trash" /></VSCodeButton>
            </div>)}
        </div>
        {regions("form", "music.form-regions")}
        {summary("Score tempo", "music.tempo", bpmSummary(tempo))}
        {summary("Performed tempo · DTW", "music.performed-tempo", bpmSummary(performedValues))}
        {regions("keys", "music.key-regions")}{regions("meters", "music.meter-regions")}
        {summary("Mood · VA", "music.va", `V ${metadata.values.valence?.toFixed(2) ?? "—"} · A ${metadata.values.arousal?.toFixed(2) ?? "—"}`)}
        {textField("context")}
        <label className="metadata-field"><span className="metadata-field-heading">{t("Theme type")}</span><select aria-label={t("Theme type")} value={metadata.values.theme} onChange={event => change("theme", event.target.value)}><option value="">—</option>{THEMES.map(theme => <option key={theme} value={theme}>{t(theme)}</option>)}</select></label>
        {metadata.values.theme === "Other" && textField("otherTheme")}
        {inferred && conflicts.length > 0 && <details className="metadata-inference"><summary>{t("MusicXML values")} ({conflicts.length})</summary>{conflicts.map(field => <label key={field}><input type="checkbox" checked={overrides.includes(field)} onChange={event => setOverrides(previous => event.target.checked ? [...previous, field] : previous.filter(key => key !== field))} /><span>{t(METADATA_LABELS[field])}</span></label>)}<VSCodeButton disabled={!overrides.length} onClick={() => editor.setMetadata(mergeScoreMetadata(editor.metadata, inferred, overrides))}>{t("Apply selected score values")}</VSCodeButton></details>}
        {error && <div role="alert">{error}</div>}
    </CollapsiblePanel>;
}
