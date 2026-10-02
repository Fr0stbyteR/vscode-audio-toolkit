import { FunctionComponent } from "react";
import { createPortal } from "react-dom";
import ConfigurationSections from "../../components/ConfigurationSections";
import { useLocale } from "../../i18n/LocaleContext";
import type { ScoreState } from "./ScoreModule";
import { ParsedScore } from "./ScoreLibrary";
import ScoreImportActions from "./ScoreImportActions";

interface Props {
    state: ScoreState;
    score?: ParsedScore;
    busy: string;
    error: string;
    selectedTime?: number;
    playheadSeconds: number;
    mode: "analysis" | "appearance" | "both";
    activeLayer: boolean;
    moduleKind: "score" | "pianoroll";
    onImport(file: File): void;
    onOmr?(file: File): void;
    onAutoAlign(): void;
    onAnchor(scoreTime: number, audioTime: number): void;
    onClearAnchors(): void;
    onAddCompanion(): void;
    onTrackVisibility?(trackId: string, visible: boolean): void;
}

const ScoreControls: FunctionComponent<Props> = props => {
    const { t } = useLocale();
    const content = <ConfigurationSections mode={props.mode} analysis={<div className="score-config">
        <ScoreImportActions kind={props.moduleKind} busy={!!props.busy} onImport={props.onImport} onOmr={props.onOmr} />
        {props.state.fileName ? <small title={props.state.fileName}>{props.state.fileName}</small> : null}
        {props.score ? <>
            <button type="button" disabled={!!props.busy || !props.score.notes.length} onClick={props.onAutoAlign}>{t("Auto-align to audio (DTW)")}</button>
            {props.moduleKind === "score" || props.score.format !== "midi" ? <button type="button" onClick={props.onAddCompanion}>{t(props.moduleKind === "score" ? "Add synchronized piano roll" : "Add synchronized score")}</button> : null}
            {props.selectedTime !== undefined ? <button type="button" onClick={() => props.onAnchor(props.selectedTime!, props.playheadSeconds)}>{t("Anchor selected note to playhead")}</button> : null}
            <small>{t("Alt-click a note to select it without moving the playhead")}</small>
            <span>{props.state.autoAlignment.length ? t("Automatic alignment active") : t("Linear timing until aligned")}</span>
            <span>{props.state.manualAnchors.length} {t("manual anchors")}</span>
            {props.state.manualAnchors.length ? <button type="button" onClick={props.onClearAnchors}>{t("Clear manual anchors")}</button> : null}
        </> : null}
        {props.busy ? <span role="status">{t(props.busy)}…</span> : null}
        {props.error ? <span className="error-text" role="alert">{t(props.error)}</span> : null}
        {props.state.omrWarnings?.map(warning => <small className="omr-warning" key={warning}>{t(warning)}</small>)}
    </div>} appearance={props.onTrackVisibility && props.score ? <div className="score-tracks"><strong>{t("Instruments")}</strong>{props.score.tracks.map(track => <label key={track.id}><input type="checkbox" checked={!props.state.hiddenTracks.includes(track.id)} onChange={event => props.onTrackVisibility?.(track.id, event.target.checked)} /><span style={{ color: track.color }}>●</span>{track.name}</label>)}</div> : undefined} />;
    const host = document.getElementById("inspector-config-root");
    return host ? props.activeLayer ? createPortal(content, host) : null : <div className="visualizer-component-configuration">{content}</div>;
};

export default ScoreControls;
