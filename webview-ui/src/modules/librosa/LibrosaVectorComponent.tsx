import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import { getVisualizerRulerWidth, VisualizationOptions } from "../../core/AudioToolkitModule";
import VectorImageProcessor, { VectorCursorInfo } from "../../core/VectorImageProcessor";
import { setCanvasToFullSize } from "../../utils";
import LibrosaConfiguration from "./LibrosaConfiguration";
import LibrosaVectorModule from "./LibrosaVectorModule";
import { formatCacheInfo } from "./LibrosaCacheInfo";
import { useLocale } from "../../i18n/LocaleContext";

function getTransform(module: LibrosaVectorModule<any>) {
    let min = Infinity;
    let max = -Infinity;
    for (const slice of module.dataSlices ?? []) for (const vector of slice.vectors) for (const value of vector) {
        if (!Number.isFinite(value)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
    if (min >= 0) min = 0;
    if (max <= min) max = min + 1;
    const padding = (max - min) * 0.05;
    min -= padding;
    max += padding;
    const zoom = 2 / (max - min);
    return { zoom, offset: ((min + max) / 2) * zoom };
}

const LibrosaVectorComponent: FunctionComponent<VisualizationOptions<LibrosaVectorModule<any>>> = props => {
    const { locale, t } = useLocale();
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
    const [cacheInfo, setCacheInfo] = useState(module.cacheInfo);
    useEffect(() => {
        module.onDataChange = data => {
            setDataSlices(data as typeof module.dataSlices);
            const transform = getTransform(module);
            setDefaultVerticalZoom(transform.zoom);
            setDefaultVerticalOffset(transform.offset);
            setVerticalZoom(transform.zoom);
            setVerticalOffset(transform.offset);
        };
        module.onCalculating = setCalculating;
        module.onCacheInfo = setCacheInfo;
        return () => { module.onDataChange = undefined; module.onCalculating = undefined; module.onCacheInfo = undefined; };
    }, [module]);
    const paint = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
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
        VectorImageProcessor.paintHorizontalRuler(ctx, 1, { width, height, verticalZoom, verticalOffset, labelMode: "linear", labelUnit: module.unit, labelsWidth: getVisualizerRulerWidth(canvas) }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [gridColor, gridRulerColor, module.unit, monospaceFont, textColor, verticalOffset, verticalZoom]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (!dataSlices?.length || x < 0 || x > width || y < 0 || y > height) { setCursorX(undefined); setCursorY(undefined); setCursorInfo(null); return; }
        const info = VectorImageProcessor.getInfoFromCursor(dataSlices, x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
        setCursorX(info.x); setCursorY(info.y); setCursorInfo(info);
    }, [dataSlices, verticalOffset, verticalZoom, viewRange]);
    const configurationContent = <LibrosaConfiguration module={module} moduleState={moduleState} mode={props.configurationMode} />;
    const monitorContent = <div className="default-layout"><div>{formatCacheInfo(cacheInfo, locale)}</div>{cursorInfo ? <><div>{cursorInfo.fromIndex}–{cursorInfo.toIndex} {t("samples")}</div><div>{typeof cursorInfo.value === "number" ? cursorInfo.value.toFixed(3) : cursorInfo.value.map(value => value.toFixed(3)).join(" – ")} {module.unit}</div></> : null}</div>;
    return <ModuleUsingCanvas {...props} {...{ calculating, defaultVerticalOffset, verticalOffset, setVerticalOffset, defaultVerticalZoom, verticalZoom, setVerticalZoom, cursorX, cursorY, onCursor, paint, paintVerticalRuler, paintHorizontalRuler, configurationContent, monitorContent }} />;
};

export default LibrosaVectorComponent;
