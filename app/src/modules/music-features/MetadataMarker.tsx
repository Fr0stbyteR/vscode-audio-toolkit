import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import AudioEditor from "../../core/AudioEditor";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import ModuleUsingMarker from "../../components/ModuleUsingMarker";
import Marker, { MarkerState } from "../marker/Marker";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import { setCanvasToFullSize } from "../../utils";
import { useLocale } from "../../i18n/LocaleContext";
import { loadScore } from "../score/ScoreLibrary";
import type { ScoreState } from "../score/ScoreModule";
import { alignmentPoints, audioTimeAtScore } from "../score/Alignment";
import { inferScoreStructure } from "./ScoreStructure";
import ModuleEmptyState from "../../components/ModuleEmptyState";
import { openScoreModule } from "./openScoreModule";

type RegionField = "form" | "keys" | "meters";
export interface MetadataMarkerState extends MarkerState { field: RegionField; minimumMeasures: number; }

export class MetadataMarker extends Marker {
    static MODULE_ID = "music.form-regions";
    static MODULE_NAME = "Form · regions";
    static DEFAULT_STATE: MetadataMarkerState = { name: "", data: [], field: "form", minimumMeasures: 4 };
    static async fromAudioData(editor: AudioEditor, initial: Partial<MetadataMarkerState> = {}) {
        return new MetadataMarker(editor, { ...this.DEFAULT_STATE, ...initial, field: "form" });
    }
    public Component = MetadataMarkerComponent;
    protected constructor(editor: AudioEditor, state: MetadataMarkerState) {
        const restored = { ...state } as MetadataMarkerState & { candidates?: unknown };
        delete restored.candidates; // Old pending suggestions are not committed annotations.
        super(editor, restored);
        this.moduleId = `music.${state.field === "keys" ? "key" : state.field === "meters" ? "meter" : "form"}-regions`;
    }
    getState() { return this.state as MetadataMarkerState; }
    addMarker(position: number | [number, number], name = "", color = "#4e94ce") {
        if (typeof position === "number" || position[1] <= position[0]) return;
        super.addMarker(position, name, color);
    }
    setState(state: MarkerState | MetadataMarkerState) {
        const old = this.getState();
        super.setState({ ...old, ...state });
        if (JSON.stringify(old.data) === JSON.stringify(state.data)) return;
        const metadata = this.audioEditor.metadata, sampleRate = this.audioEditor.sampleRate;
        const regions = state.data.map((marker, index) => { const [start, end] = typeof marker.position === "number" ? [marker.position, marker.position] : marker.position; return { id: `${old.field}-${index}`, label: marker.name, start: start / sampleRate, end: end / sampleRate }; });
        this.audioEditor.setMetadata({ ...metadata, values: { ...metadata.values, [old.field]: regions }, sources: { ...metadata.sources, [old.field]: "user" } });
    }
    syncMetadata() {
        const state = this.getState();
        const data = this.audioEditor.metadata.values[state.field].map((region, index) => ({ name: region.label, position: [region.start * this.audioEditor.sampleRate, region.end * this.audioEditor.sampleRate] as [number, number], color: state.data[index]?.color ?? "#4e94ce" }));
        if (JSON.stringify(state.data) !== JSON.stringify(data)) super.setState({ ...state, data });
    }
    async inferSections() {
        const audioKey = this.audioEditor.uri || `${this.audioEditor.sampleRate}:${this.audioEditor.length}`;
        const source = this.audioEditor.modulesInstance.filter(module => module.moduleId === "score.musicxml" || module.moduleId === "score.pianoroll").map(module => module.getState() as ScoreState).find(state => state.scoreKey && state.alignmentAudioKey === audioKey && (state.autoAlignment.length > 2 || state.manualAnchors.length >= 2));
        if (!source) throw new Error("Import a score and run DTW alignment first");
        const score = await loadScore(source.scoreKey);
        const regions = inferScoreStructure(score.notes, score.events.filter(event => event.kind === "measure").map(event => event.time), score.duration, this.getState().minimumMeasures);
        const alignment = source.autoAlignment.length > 2 ? alignmentPoints(source.autoAlignment, source.manualAnchors, score.duration, this.audioEditor.duration) : source.manualAnchors;
        if (!regions.length) throw new Error("Could not infer score sections");
        const form = regions.map(region => ({ ...region, start: audioTimeAtScore(alignment, region.start), end: audioTimeAtScore(alignment, region.end) }));
        const metadata = this.audioEditor.metadata;
        this.audioEditor.setMetadata({ ...metadata, values: { ...metadata.values, form }, sources: { ...metadata.sources, form: "user" } });
        this.syncMetadata();
    }
}
export class KeyRegions extends MetadataMarker {
    static MODULE_ID = "music.key-regions";
    static MODULE_NAME = "Mode / key · regions";
    static DEFAULT_STATE = { ...MetadataMarker.DEFAULT_STATE, field: "keys" as const };
    static async fromAudioData(editor: AudioEditor, initial: Partial<MetadataMarkerState> = {}) { return new KeyRegions(editor, { ...this.DEFAULT_STATE, ...initial, field: "keys" }); }
}
export class MeterRegions extends MetadataMarker {
    static MODULE_ID = "music.meter-regions";
    static MODULE_NAME = "Meter · regions";
    static DEFAULT_STATE = { ...MetadataMarker.DEFAULT_STATE, field: "meters" as const };
    static async fromAudioData(editor: AudioEditor, initial: Partial<MetadataMarkerState> = {}) { return new MeterRegions(editor, { ...this.DEFAULT_STATE, ...initial, field: "meters" }); }
}

const MetadataMarkerComponent: FunctionComponent<VisualizationOptions<Marker>> = props => {
    const module = props.module as MetadataMarker, state = props.moduleState as MetadataMarkerState;
    const { t } = useLocale();
    const [busy, setBusy] = useState(false), [error, setError] = useState("");
    useEffect(() => { const update = () => module.syncMetadata(); module.audioEditor.on("metadata", update); update(); return () => { module.audioEditor.off("metadata", update); }; }, [module]);
    const paintVerticalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange: props.viewRange, configuration: props.configuration }, { gridColor: props.gridColor });
    }, [module, props.viewRange, props.configuration, props.gridColor]);
    const infer = async () => {
        if (state.data.length && !window.confirm(t("Replace existing form regions with candidates?"))) return;
        setBusy(true); setError(""); try { await module.inferSections(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
    };
    const controls = state.field === "form" ? <div className="default-layout">
        <label>{t("Minimum section (measures)")}<input type="number" min="2" max="32" value={state.minimumMeasures} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 2 && value <= 32) module.setState({ ...state, minimumMeasures: Math.floor(value) }); }} /></label>
        <VSCodeButton disabled={busy} onClick={infer}>{t("Infer score sections")}</VSCodeButton>
        {error && <div role="alert">{t(error)}</div>}
    </div> : undefined;
    return <ModuleUsingMarker {...props} module={module} regionOnly markerClassName={state.name} markerData={state.data} calculating={busy} {...{ paintVerticalRuler }} configurationContentChildren={controls}
        emptyContent={!state.data.length && !busy ? <ModuleEmptyState message={t(error || "Select a range to add a region")}>
            {state.field === "form" && <VSCodeButton onClick={infer}>{t("Infer score sections")}</VSCodeButton>}
            <VSCodeButton appearance="secondary" onClick={() => void openScoreModule(module.audioEditor)}>{t("Open score module")}</VSCodeButton>
            <VSCodeButton appearance="secondary" disabled={!props.selRange || props.selRange[1] <= props.selRange[0]} onClick={() => { if (props.selRange) module.addMarker(props.selRange, t("Region")); }}>{t("Add selection region")}</VSCodeButton>
        </ModuleEmptyState> : undefined} />;
};
