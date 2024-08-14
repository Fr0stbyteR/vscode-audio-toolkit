import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Module from "./LevelExtractor";
import VectorImageProcessor, { VectorCursorInfo } from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import ConfigurationContent from "./ConfigurationContent";

const Component: FunctionComponent<VisualizationOptions<Module>> = (props) => {
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const max = module.dataSlices?.length ? Math.max.apply(Math, module.dataSlices.map(ds => ds.resizedVectors.resizes.length ? ds.resizedVectors.resizes[ds.resizedVectors.resizes.length - 1].maxData : ds.vectors).flat().map(f => Math.max.apply(Math, f as any))) : 100;
    const [defaultVerticalZoom, setDefaultVerticalZoom] = useState(1.75 / max);
    const defaultVerticalOffset = 1;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const [cursorX, setCursorX] = useState<number | undefined>();
    const [cursorY, setCursorY] = useState<number | undefined>();
    const [cursorInfo, setCursorInfo] = useState<VectorCursorInfo | null>(null);
    const [repaintId, setRepaintId] = useState(performance.now());
    const [essentiaState, setEssentiaState] = useState(module.getEssentiaState(moduleState));
    const [dataSlices, setDataSlices] = useState<typeof module.dataSlices>(module.dataSlices);
    const [calculating, setCalculating] = useState<boolean | [number, string]>(module.isCalculating);
    const handleDataChange = useCallback((dataSlices: typeof module.dataSlices) => {
        setDataSlices(dataSlices);
        const max = Math.max.apply(Math, dataSlices!.map(ds => ds.resizedVectors.resizes.length ? ds.resizedVectors.resizes[ds.resizedVectors.resizes.length - 1].maxData : ds.vectors).flat().map(f => Math.max.apply(Math, f as any)));
        setDefaultVerticalZoom(1.75 / max);
        setVerticalZoom(1.75 / max);
    }, [module]);
    const handleCalculating = useCallback((calculating: boolean | [number, string]) => setCalculating(calculating), []);
    useEffect(() => {
        module.onDataChange = handleDataChange;
        module.onCalculating = handleCalculating;
        return () => {
            module.onDataChange = undefined;
            module.onCalculating = undefined;
        };
    }, [handleCalculating, handleDataChange, module]);
    const paint = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        if (!dataSlices?.length) return;
        const [width, height] = setCanvasToFullSize(canvas);
        ctx.clearRect(0, 0, width, height);
        VectorImageProcessor.paint(ctx, dataSlices, { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit" }, { viewRange }, { phosphorColor: moduleState.color });
    }, [dataSlices, moduleState, verticalZoom, verticalOffset, viewRange]);
    const paintVerticalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [module, viewRange, configuration, gridColor]);
    const paintHorizontalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintHorizontalRuler(ctx, module.audioEditor.numberOfChannels, { width, height, verticalZoom, verticalOffset, labelMode: "linear", labelUnit: "Loudness", labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [module, verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (y < 0 || y > height) setCursorY(undefined);
        if (x < 0 || x > width) {
            setCursorX(undefined);
            setCursorY(undefined);
            setCursorInfo(null);
            return;
        }
        if (!dataSlices?.length) return;
        const info = VectorImageProcessor.getInfoFromCursor(dataSlices, x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
        setCursorX(info.x);
        setCursorY(info.y);
        setCursorInfo(info);
    }, [dataSlices, verticalOffset, verticalZoom, viewRange]);
    const setModuleState = useCallback((state: typeof module.state) => module.setState(state), [module]);
    const optionsMetadata = module.getOptionsMetadata();
    const configurationContent = <ConfigurationContent {...{ moduleId: module.moduleId, essentiaState, setEssentiaState, moduleState, setModuleState, optionsMetadata }} />;
    const monitorContent = dataSlices?.length ? (
        <div className="default-layout">
            {
                cursorInfo
                ? <>
                    <div>Channel: {cursorInfo.channel + 1}</div>
                    <div style={{ color: moduleState.color }}>Loudness</div>
                    <div style={{ color: moduleState.color }}>{typeof cursorInfo.value === "number" ? cursorInfo.value.toFixed(3) : cursorInfo.value.map(v => v.toFixed(3)).join(" to ")}</div>
                </>
                : null
            }
        </div>
    ) : undefined;
    const moduleUsingCanvasProps = {
        calculating,
        defaultVerticalOffset, verticalOffset, setVerticalOffset,
        defaultVerticalZoom, verticalZoom, setVerticalZoom,
        cursorX, cursorY, onCursor,
        paint, paintVerticalRuler, paintHorizontalRuler,
        configurationContent, monitorContent,
        repaintId,
        ...props
    };
    return (
        <ModuleUsingCanvas {...moduleUsingCanvasProps} />
    );
};

export default Component;
