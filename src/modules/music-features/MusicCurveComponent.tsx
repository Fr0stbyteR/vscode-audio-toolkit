import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import ConfigurationSections from "../../components/ConfigurationSections";
import { VisualizationOptions, getVisualizerRulerWidth } from "../../core/AudioToolkitModule";
import VectorImageProcessor, { VectorCursorInfo } from "../../core/VectorImageProcessor";
import { curveVectors } from "./CurveVectors";
import { setCanvasToFullSize } from "../../utils";
import { useLocale } from "../../i18n/LocaleContext";
import { MusicCurve } from "./MusicCurve";
import ModuleEmptyState from "../../components/ModuleEmptyState";
import { openScoreModule } from "./openScoreModule";
import type { StatisticsSource } from "../../core/RangeStatistics";

const MusicCurveComponent: FunctionComponent<VisualizationOptions<MusicCurve>> = props => {
    const { module, moduleState: state, viewRange, configuration, gridColor, gridRulerColor, textColor, monospaceFont } = props;
    const { t } = useLocale();
    const [busy, setBusy] = useState(module.busy);
    const [selected, setSelected] = useState(0);
    const [cursorX, setCursorX] = useState<number>();
    const [cursorY, setCursorY] = useState<number>();
    const [cursorInfo, setCursorInfo] = useState<VectorCursorInfo | null>(null);
    const dataSlices = useMemo(() => curveVectors(state.points, module.audioEditor.sampleRate, state.kind === "va" ? 2 : 1, module.audioEditor.length), [state.points, state.kind, module]);
    const statisticsSource = useMemo<StatisticsSource | undefined>(() => dataSlices[0]?.length ? {
        kind: "vector", unit: state.kind === "va" ? "" : "BPM", labels: state.kind === "va" ? ["Valence", "Arousal"] : undefined,
        metadata: state.analysisMetadata,
        slices: [{ ...dataSlices[0][0], vectors: dataSlices.map(channel => channel[0].vectors[0]) }]
    } : undefined, [dataSlices, state.kind, state.analysisMetadata]);
    const values = state.points.flatMap(point => point.values).filter((value): value is number => value !== null && Number.isFinite(value));
    const min = state.kind === "va" ? -1.1 : Math.min(0, ...values);
    const max = state.kind === "va" ? 1.1 : Math.max(150, ...values) * 1.05;
    const zoom = 2 / Math.max(.001, max - min), offset = (max + min) / 2 * zoom;
    const [verticalZoom, setVerticalZoom] = useState(zoom), [verticalOffset, setVerticalOffset] = useState(offset);
    useEffect(() => { setVerticalZoom(zoom); setVerticalOffset(offset); }, [zoom, offset]);
    useEffect(() => {
        module.onBusyChange = setBusy;
        if (module.getState().kind === "va" && module.getState().points.length) module.updateMoodSummary();
        const metadata = () => module.syncMetadata();
        const alignment = () => { if (module.getState().kind === "performed") void module.calculate(false); };
        module.audioEditor.on("metadata", metadata);
        module.audioEditor.on("modulesState", alignment);
        metadata(); alignment();
        return () => { module.onBusyChange = undefined; module.audioEditor.off("metadata", metadata); module.audioEditor.off("modulesState", alignment); };
    }, [module]);
    const paint = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas); ctx.clearRect(0, 0, width, height);
        const from = viewRange[0] / module.audioEditor.sampleRate, span = (viewRange[1] - viewRange[0]) / module.audioEditor.sampleRate;
        if (span <= 0) return;
        dataSlices.forEach((slices, channel) => {
            if (!slices.length) return;
            VectorImageProcessor.paint(ctx, slices, { width, height, verticalZoom, verticalOffset, paintOver: true, beforeAndAfter: "none", interpolation: state.kind === "tempo" ? "step" : "linear" }, { viewRange }, { phosphorColor: state.colors[channel] });
            const point = state.points[selected], value = point?.values[channel];
            if (point && typeof value === "number" && Number.isFinite(value) && props.activeLayer && state.kind !== "performed" && point.time >= from && point.time <= from + span) {
                ctx.fillStyle = state.colors[channel];
                ctx.fillRect((point.time - from) / span * width - 3, (1 - (value * verticalZoom - verticalOffset)) * height / 2 - 3, 6, 6);
            }
        });
        if (state.kind === "va") { ctx.font = monospaceFont; state.colors.forEach((color, index) => { ctx.fillStyle = color; ctx.fillText(index ? "A" : "V", 12 + index * 35, 18); }); }
    }, [state, dataSlices, module, viewRange, verticalZoom, verticalOffset, selected, props.activeLayer, monospaceFont]);
    const paintVerticalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [module, viewRange, configuration, gridColor]);
    const paintHorizontalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintHorizontalRuler(ctx, 1, { width, height, verticalZoom, verticalOffset, labelMode: "linear", labelUnit: state.kind === "va" ? "VA" : "BPM", labelsWidth: getVisualizerRulerWidth(canvas) }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [verticalZoom, verticalOffset, state.kind, gridColor, gridRulerColor, textColor, monospaceFont]);
    const nearest = cursorInfo?.pointIndex === undefined ? undefined : state.points[cursorInfo.pointIndex];
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (!state.points.length || width <= 0 || height <= 0 || x < 0 || x > width || y < 0 || y > height) { setCursorX(undefined); setCursorY(undefined); setCursorInfo(null); return; }
        const infos = dataSlices.filter(slices => slices.length).map(slices => VectorImageProcessor.getInfoFromCursor(slices, x, y, { width, height, verticalZoom, verticalOffset }, { viewRange }));
        const finite = infos.filter(info => typeof info.value === "number" && Number.isFinite(info.value));
        const info = finite.reduce((best, next) => Math.abs(next.y - y) < Math.abs(best.y - y) ? next : best, finite[0]) ?? infos[0];
        setCursorInfo(info?.pointIndex === undefined ? null : info);
        setCursorX(info?.pointIndex === undefined ? undefined : info.x);
        setCursorY(info?.pointIndex === undefined || !finite.length ? undefined : info.y);
    }, [state.points.length, dataSlices, viewRange, verticalZoom, verticalOffset]);
    const edit = (channel: number, value: number) => {
        if (!Number.isFinite(value)) return;
        module.editPoints(state.points.map((point, index) => index === selected ? { ...point, values: point.values.map((previous, c) => c === channel ? Math.max(state.kind === "va" ? -1 : 1, Math.min(state.kind === "va" ? 1 : 600, value)) : previous) } : point));
    };
    const analysis = <div className="default-layout">
        {state.kind !== "tempo" && <><label>{t("Window (s)")}<input type="number" min={state.kind === "va" ? 3 : .5} max="60" step=".5" value={state.windowSeconds} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= (state.kind === "va" ? 3 : .5) && value <= 60) module.setState({ ...state, windowSeconds: value }); }} /></label>
            <label>{t("Hop (s)")}<input type="number" min=".1" max="30" step=".1" value={state.hopSeconds} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= .1 && value <= 30) module.setState({ ...state, hopSeconds: value }); }} /></label>
            <VSCodeButton disabled={busy} onClick={() => void module.calculate()}>{t(state.kind === "va" ? "Analyze mood" : "Recalculate")}</VSCodeButton></>}
        {state.source && <small>{t(state.source)}</small>}
        {state.error && <div role="alert">{t(state.error)}</div>}
        {state.kind !== "performed" && <>
            <VSCodeButton appearance="secondary" onClick={() => { const points = [...state.points, { time: module.audioEditor.state.playhead / module.audioEditor.sampleRate, values: state.kind === "va" ? [0, 0] : [120] }].sort((a, b) => a.time - b.time); module.editPoints(points); setSelected(points.findIndex(point => point.time === module.audioEditor.state.playhead / module.audioEditor.sampleRate)); }}>{t("Add point at playhead")}</VSCodeButton>
            {state.points.length > 0 && <><select aria-label={t("Curve point")} value={Math.min(selected, state.points.length - 1)} onChange={event => setSelected(Number(event.target.value))}>{state.points.map((point, index) => <option key={index} value={index}>{point.time.toFixed(2)} s</option>)}</select>
                {(state.kind === "va" ? ["Valence", "Arousal"] : ["BPM"]).map((label, channel) => <label key={label}>{t(label)}<input aria-label={t(label)} type="number" step={state.kind === "va" ? .05 : 1} min={state.kind === "va" ? -1 : 1} max={state.kind === "va" ? 1 : 600} value={state.points[selected]?.values[channel] ?? ""} onChange={event => edit(channel, event.target.valueAsNumber)} /></label>)}
                <VSCodeButton appearance="secondary" onClick={() => { module.editPoints(state.points.filter((_, index) => index !== selected)); setSelected(0); }}>{t("Delete point")}</VSCodeButton></>}
        </>}
    </div>;
    const appearance = <div className="default-layout">{(state.kind === "va" ? ["Valence", "Arousal"] : ["Color"]).map((label, channel) => <label key={label}>{t(label)}<input type="color" value={state.colors[channel]} onChange={event => module.setState({ ...state, colors: state.colors.map((color, index) => index === channel ? event.target.value : color) })} /></label>)}</div>;
    const addPoint = () => module.editPoints([...state.points, { time: module.audioEditor.state.playhead / module.audioEditor.sampleRate, values: state.kind === "va" ? [0, 0] : [120] }]);
    return <ModuleUsingCanvas {...props} statisticsSource={statisticsSource} calculating={busy} defaultVerticalZoom={zoom} defaultVerticalOffset={offset} {...{ verticalZoom, setVerticalZoom, verticalOffset, setVerticalOffset, paint, paintVerticalRuler, paintHorizontalRuler, cursorX, cursorY, onCursor }}
        emptyContent={!state.points.length && !busy ? <ModuleEmptyState message={t(state.error || (state.kind === "va" ? "Analyze audio or add mood points" : "Import a score to get tempo data"))}>
            {state.kind === "va" ? <VSCodeButton onClick={() => void module.calculate()}>{t("Analyze mood")}</VSCodeButton> : <VSCodeButton onClick={() => void openScoreModule(module.audioEditor)}>{t("Open score module")}</VSCodeButton>}
            {state.kind === "performed" ? <VSCodeButton appearance="secondary" onClick={() => void module.calculate()}>{t("Recalculate")}</VSCodeButton> : <VSCodeButton appearance="secondary" onClick={addPoint}>{t("Add point at playhead")}</VSCodeButton>}
        </ModuleEmptyState> : undefined}
        onCanvasMouseDown={(event, rect) => { if (!event.altKey || state.kind === "performed") return false; const time = (viewRange[0] + (event.clientX - rect.left) / rect.width * (viewRange[1] - viewRange[0])) / module.audioEditor.sampleRate; const index = state.points.reduce((best, point, i) => Math.abs(point.time - time) < Math.abs((state.points[best]?.time ?? Infinity) - time) ? i : best, 0); setSelected(index); return true; }}
        configurationContent={<ConfigurationSections mode={props.configurationMode} {...{ analysis, appearance }} />}
        monitorContent={<div className="default-layout">{nearest && cursorInfo && <><div>{t("Sample point")} #{cursorInfo.pointIndex! + 1} · {cursorInfo.fromIndex} {t("samples")}</div><div>{nearest.time.toFixed(3)} s</div>{nearest.values.map((value, index) => <div key={index}>{state.kind === "va" ? index ? "A" : "V" : "BPM"}: {value?.toFixed(3) ?? "—"}</div>)}</>}</div>} />;
};
export default MusicCurveComponent;
