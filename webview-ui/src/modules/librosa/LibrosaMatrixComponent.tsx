import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import MatrixImageProcessor, { MatrixCursorInfo } from "../../core/MatrixImageProcessor";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import { setCanvasToFullSize } from "../../utils";
import LibrosaConfiguration from "./LibrosaConfiguration";
import LibrosaMatrixModule from "./LibrosaMatrixModule";
import MatrixWebGLRenderer from "../../core/MatrixWebGLRenderer";
import { formatCacheInfo } from "./LibrosaCacheInfo";

const LibrosaMatrixComponent: FunctionComponent<VisualizationOptions<LibrosaMatrixModule<any>>> = props => {
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const defaultVerticalZoom = 1;
    const defaultVerticalOffset = 0;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const [cursorX, setCursorX] = useState<number>();
    const [cursorY, setCursorY] = useState<number>();
    const [cursorInfo, setCursorInfo] = useState<MatrixCursorInfo | null>(null);
    const [dataSlices, setDataSlices] = useState(module.dataSlices);
    const [calculating, setCalculating] = useState<boolean | [number, string]>(module.isCalculating);
    const [renderInfo, setRenderInfo] = useState("Waiting for data");
    const [cacheInfo, setCacheInfo] = useState(module.cacheInfo);
    const valueSpan = Math.max(Number.EPSILON, module.valueRange[1] - module.valueRange[0]);
    const colorMin = Math.max(0, Math.min(1, moduleState.colorMin ?? 0));
    const colorMax = Math.max(colorMin + Number.EPSILON, Math.min(1, moduleState.colorMax ?? 1));
    const displayRange = useMemo<[number, number]>(() => [module.valueRange[0] + valueSpan * colorMin, module.valueRange[0] + valueSpan * colorMax], [colorMax, colorMin, module.valueRange, valueSpan]);
    const colorMap = moduleState.colorMap ?? "inferno";
    useEffect(() => {
        module.onDataChange = data => setDataSlices(data as typeof module.dataSlices);
        module.onCalculating = setCalculating;
        module.onCacheInfo = setCacheInfo;
        return () => { module.onDataChange = undefined; module.onCalculating = undefined; module.onCacheInfo = undefined; };
    }, [module]);
    const paint = useCallback(async (ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !dataSlices?.length) return;
        const [width, height] = setCanvasToFullSize(canvas);
        if (configuration.matrixRenderer !== "canvas2d" && dataSlices.length === 1) {
            try {
                const stats = MatrixWebGLRenderer.forCanvas(canvas)?.paint(ctx, dataSlices[0], width, height, viewRange, verticalZoom, verticalOffset, displayRange, colorMap);
                if (stats) {
                    setRenderInfo(`WebGL 2 · upload ${stats.uploadMs.toFixed(2)} ms · draw ${stats.drawMs.toFixed(2)} ms`);
                    return;
                }
            } catch (error) {
                console.error("Matrix WebGL rendering failed; falling back to Canvas 2D.", error);
            }
            setRenderInfo("WebGL unavailable or failed · Canvas 2D fallback");
        }
        try {
            const started = performance.now();
            await MatrixImageProcessor.paint(ctx, dataSlices, { width, height, verticalZoom, verticalOffset, minValue: displayRange[0], maxValue: displayRange[1], colorMap }, { viewRange }, {});
            setRenderInfo(`Canvas 2D · ${(performance.now() - started).toFixed(2)} ms`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Matrix Canvas 2D rendering failed.", error);
            setRenderInfo(`Render failed: ${message}`);
        }
    }, [colorMap, configuration.matrixRenderer, dataSlices, displayRange, verticalOffset, verticalZoom, viewRange]);
    const paintVerticalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [configuration, gridColor, module, viewRange]);
    const paintHorizontalRuler = useCallback((ref: React.RefObject<HTMLCanvasElement>) => {
        const canvas = ref.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        const fromBin = verticalOffset / 2 * module.bins / verticalZoom;
        const toBin = (verticalOffset / 2 + 1) * module.bins / verticalZoom;
        const rulerZoom = 2 / Math.max(1, toBin - fromBin);
        const rulerOffset = ((fromBin + toBin) / 2) * rulerZoom;
        VectorImageProcessor.paintHorizontalRuler(ctx, 1, { width, height, verticalZoom: rulerZoom, verticalOffset: rulerOffset, labelMode: "linear", labelUnit: module.unit, labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [gridColor, gridRulerColor, module.bins, module.unit, monospaceFont, textColor, verticalOffset, verticalZoom]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (!dataSlices?.length || x < 0 || x > width || y < 0 || y > height) { setCursorX(undefined); setCursorY(undefined); setCursorInfo(null); return; }
        const info = MatrixImageProcessor.getInfoFromCursor(dataSlices, x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
        setCursorX(info.x); setCursorY(info.y); setCursorInfo(info);
    }, [dataSlices, verticalOffset, verticalZoom, viewRange]);
    const configurationContent = <LibrosaConfiguration module={module} moduleState={moduleState} mode={props.configurationMode} />;
    const monitorContent = <div className="default-layout"><div>{formatCacheInfo(cacheInfo)}</div><div>{renderInfo}</div>{cursorInfo ? <><div>{cursorInfo.fromIndex}–{cursorInfo.toIndex} samples</div><div>Bin {cursorInfo.fromBin}–{cursorInfo.toBin}</div><div>{cursorInfo.value.toFixed(3)} {module.unit}</div></> : null}</div>;
    return <ModuleUsingCanvas {...props} {...{ calculating, defaultVerticalOffset, verticalOffset, setVerticalOffset, defaultVerticalZoom, verticalZoom, setVerticalZoom, cursorX, cursorY, onCursor, paint, paintVerticalRuler, paintHorizontalRuler, configurationContent, monitorContent }} foregroundOpacity={moduleState.opacity ?? 1} />;
};

export default LibrosaMatrixComponent;
