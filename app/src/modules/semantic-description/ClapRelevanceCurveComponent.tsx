import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import ConfigurationSections from "../../components/ConfigurationSections";
import { getVisualizerRulerWidth, VisualizationOptions } from "../../core/AudioToolkitModule";
import VectorImageProcessor, { VectorCursorInfo } from "../../core/VectorImageProcessor";
import { setCanvasToFullSize } from "../../utils";
import ClapRelevanceCurve, { ClapRelevanceCurveState } from "./ClapRelevanceCurve";
import "./ClapRelevanceCurveComponent.scss";
import { useLocale } from "../../i18n/LocaleContext";

function getTransform(module: ClapRelevanceCurve) {
    const values = module.dataSlices?.[0]?.vectors[0];
    let min = values?.length ? Infinity : -1;
    let max = values?.length ? -Infinity : 1;
    for (const value of values ?? []) {
        if (!Number.isFinite(value)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = -1; max = 1; }
    min = Math.min(0, min); max = Math.max(0, max);
    if (max - min < 0.05) { min -= 0.05; max += 0.05; }
    const padding = (max - min) * 0.08;
    min = Math.max(-1, min - padding); max = Math.min(1, max + padding);
    const zoom = 2 / Math.max(0.001, max - min);
    return { zoom, offset: ((min + max) / 2) * zoom };
}

const ClapRelevanceCurveComponent: FunctionComponent<VisualizationOptions<ClapRelevanceCurve>> = props => {
    const { t } = useLocale();
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const initial = useMemo(() => getTransform(module), [module]);
    const [defaultVerticalZoom, setDefaultVerticalZoom] = useState(initial.zoom);
    const [defaultVerticalOffset, setDefaultVerticalOffset] = useState(initial.offset);
    const [verticalZoom, setVerticalZoom] = useState(initial.zoom);
    const [verticalOffset, setVerticalOffset] = useState(initial.offset);
    const [cursorX, setCursorX] = useState<number>();
    const [cursorY, setCursorY] = useState<number>();
    const [cursorInfo, setCursorInfo] = useState<VectorCursorInfo | null>(null);
    const [dataSlices, setDataSlices] = useState(module.dataSlices);
    const [calculating, setCalculating] = useState<boolean | [number, string]>(module.isCalculating);
    const [result, setResult] = useState(module.lastResult);
    const [draft, setDraft] = useState(moduleState);
    useEffect(() => setDraft(moduleState), [moduleState]);
    useEffect(() => {
        module.onDataChange = data => {
            setDataSlices(data);
            const transform = getTransform(module);
            setDefaultVerticalZoom(transform.zoom); setVerticalZoom(transform.zoom);
            setDefaultVerticalOffset(transform.offset); setVerticalOffset(transform.offset);
        };
        module.onCalculating = setCalculating;
        module.onResult = setResult;
        return () => { module.onDataChange = undefined; module.onCalculating = undefined; module.onResult = undefined; };
    }, [module]);
    const paint = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current; const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !dataSlices?.length) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paint(ctx, dataSlices, { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit" }, { viewRange }, { phosphorColor: moduleState.color });
    }, [dataSlices, moduleState.color, verticalOffset, verticalZoom, viewRange]);
    const paintVerticalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [configuration, gridColor, module, viewRange]);
    const paintHorizontalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintHorizontalRuler(ctx, 1, { width, height, verticalZoom, verticalOffset, labelMode: "linear", labelUnit: "cos", labelsWidth: getVisualizerRulerWidth(canvas) }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [gridColor, gridRulerColor, monospaceFont, textColor, verticalOffset, verticalZoom]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (!dataSlices?.length || x < 0 || x > width || y < 0 || y > height) { setCursorInfo(null); setCursorX(undefined); setCursorY(undefined); return; }
        const info = VectorImageProcessor.getInfoFromCursor(dataSlices, x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
        setCursorInfo(info); setCursorX(info.x); setCursorY(info.y);
    }, [dataSlices, verticalOffset, verticalZoom, viewRange]);
    const apply = (forceRefresh = false) => {
        const keyword = draft.keyword.trim();
        if (!keyword) return;
        const prompts = draft.prompts.map(value => value.trim()).filter(Boolean);
        module.setState({ ...draft, keyword, name: keyword, prompts: prompts.length ? prompts : [keyword] }, forceRefresh);
    };
    const configurationContent = <ConfigurationSections mode={props.configurationMode}
        appearance={<div className="clap-curve-settings"><label>{t("Curve color")}<input type="color" value={moduleState.color} onChange={event => module.setState({ ...moduleState, color: event.target.value })} /></label></div>}
        analysis={<div className="clap-curve-settings">
            <label>{t("Keyword")}<input value={draft.keyword} onChange={event => setDraft({ ...draft, keyword: event.target.value })} /></label>
            <label>{t("Prompts")} <span>{t("One prompt per line; multiple prompts are aggregated.")}</span><textarea rows={4} value={draft.prompts.join("\n")} onChange={event => setDraft({ ...draft, prompts: event.target.value.split("\n") })} /></label>
            <div className="clap-curve-setting-row"><label>{t("Window (s)")}<input type="number" min="1" max="30" step="0.5" value={draft.windowSeconds} onChange={event => setDraft({ ...draft, windowSeconds: +event.target.value })} /></label><label>{t("Hop (s)")}<input type="number" min="0.1" max="10" step="0.1" value={draft.hopSeconds} onChange={event => setDraft({ ...draft, hopSeconds: +event.target.value })} /></label></div>
            <label>{t("Prompt aggregation")}<select value={draft.aggregation} onChange={event => setDraft({ ...draft, aggregation: event.target.value as "mean" | "max" })}><option value="mean">{t("Mean")}</option><option value="max">{t("Maximum")}</option></select></label>
            <label>{t("Provider")}<select value={draft.providerId} onChange={event => setDraft({ ...draft, providerId: event.target.value })}><option value="">{t("Auto")}</option><option value="laion_clap_music_htsat_base">LAION-CLAP</option><option value="muq_mulan_large">MuQ-MuLan</option><option value="mock">{t("Mock (test)")}</option></select></label>
            <button onClick={() => apply(true)}>{t("Analyze curve")}</button>
        </div>} />;
    const monitorContent = <div className="default-layout clap-curve-monitor"><div><span>{t("Keyword")}</span><strong>{moduleState.keyword}</strong></div><div><span>{t("Provider")}</span><strong>{result?.providerName || "—"}</strong></div><div><span>{t("Samples")}</span><strong>{result?.points.length ?? "—"}</strong></div><div><span>{t("Cache")}</span><strong>{result ? t(result.cached ? "Hit" : "Miss") : "—"}</strong></div>{cursorInfo ? <div><span>{t("Similarity")}</span><strong>{typeof cursorInfo.value === "number" ? cursorInfo.value.toFixed(4) : "—"}</strong></div> : null}</div>;
    return <ModuleUsingCanvas {...props} {...{ calculating, defaultVerticalOffset, verticalOffset, setVerticalOffset, defaultVerticalZoom, verticalZoom, setVerticalZoom, cursorX, cursorY, onCursor, paint, paintVerticalRuler, paintHorizontalRuler, configurationContent, monitorContent }} />;
};

export default ClapRelevanceCurveComponent;
