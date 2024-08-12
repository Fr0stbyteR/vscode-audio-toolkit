import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import { LowLevelSpectralExtractorModule } from "./LowLevelSpectralExtractor";
import VectorImageProcessor, { VectorCursorInfo } from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import ConfigurationContent from "./ConfigurationContent";
import { EssentiaMatrixDataSlice, EssentiaVectorDataSlice } from "./EssentiaModule";
import MatrixImageProcessor, { MatrixCursorInfo } from "../../core/MatrixImageProcessor";

const Component: FunctionComponent<VisualizationOptions<LowLevelSpectralExtractorModule>> = (props) => {
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const [defaultVerticalZoom, setDefaultVerticalZoom] = useState(module.verticalZoom[moduleState.paintFeature]);
    const [defaultVerticalOffset, setDefaultVerticalOffset] = useState(module.verticalOffset[moduleState.paintFeature]);
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const [cursorX, setCursorX] = useState<number | undefined>();
    const [cursorY, setCursorY] = useState<number | undefined>();
    const [cursorInfo, setCursorInfo] = useState<MatrixCursorInfo | VectorCursorInfo | null>(null);
    const [repaintId, setRepaintId] = useState(performance.now());
    const [essentiaState, setEssentiaState] = useState(module.getEssentiaState(moduleState));
    const [dataSlices, setDataSlices] = useState<typeof module.dataSlices>(module.dataSlices);
    const [calculating, setCalcualting] = useState<boolean | [number, string]>(module.isCalculating);
    const handleDataChange = useCallback((dataSlices: typeof module.dataSlices) => setDataSlices(dataSlices), [module]);
    const handleCalculating = useCallback((calculating: boolean | [number, string]) => setCalcualting(calculating), []);
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
        const { color, paintFeature } = moduleState;
        if (module.featureOutputsMatrix(paintFeature)) {
            const [minValue, maxValue] = module.matrixPaintRange[paintFeature] ?? [0, 1];
            MatrixImageProcessor.paint(ctx, dataSlices.map(ds => ds[paintFeature] as EssentiaMatrixDataSlice), { width, height, verticalZoom, verticalOffset, minValue, maxValue }, { viewRange }, {});
        } else {
            VectorImageProcessor.paint(ctx, dataSlices.map(ds => ds[paintFeature] as EssentiaVectorDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit" }, { viewRange }, { phosphorColor: color });
        }
        // else ds = dataSlices.map(ds => ({ ...ds.vibratoExtend, vectors: ds.vibratoExtend.vectors.map((v, i) => [v, ds.vibratoFrequency.vectors[i]]).flat(), resizedVectors: { ...ds.vibratoExtend.resizedVectors, resizes: ds.vibratoExtend.resizedVectors.resizes.map((v, i) => [v, ds.vibratoFrequency.resizedVectors.resizes[i]]).flat() } }));
    }, [module, dataSlices, moduleState, verticalZoom, verticalOffset, viewRange]);
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
        VectorImageProcessor.paintHorizontalRuler(ctx, module.audioEditor.numberOfChannels, { width, height, verticalZoom: verticalZoom * module.horizontalRulerZoom[moduleState.paintFeature], verticalOffset: verticalOffset + module.horizontalRulerOffset[moduleState.paintFeature], labelMode: "linear", labelUnit: module.horizontalRulerUnit[moduleState.paintFeature], labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [module, moduleState, verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        const { paintFeature } = moduleState;
        if (y < 0 || y > height) setCursorY(undefined);
        if (x < 0 || x > width || (module.featureOutputsMatrix(paintFeature) && (y < 0 || y > height))) {
            setCursorX(undefined);
            setCursorY(undefined);
            setCursorInfo(null);
            return;
        }
        if (!dataSlices?.length) return;
        if (module.featureOutputsMatrix(paintFeature)) {
            const ds = dataSlices.map(ds => ds[paintFeature] as EssentiaMatrixDataSlice);
            const info = MatrixImageProcessor.getInfoFromCursor(ds, x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
            setCursorX(info.x);
            setCursorY(info.y);
            setCursorInfo(info);
        } else {
            const ds = dataSlices.map(ds => ds[paintFeature] as EssentiaVectorDataSlice);
            const info = VectorImageProcessor.getInfoFromCursor(ds, x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
            setCursorX(info.x);
            setCursorY(info.y);
            setCursorInfo(info);
        }
    }, [module, dataSlices, moduleState, verticalOffset, verticalZoom, viewRange]);
    const setModuleState = useCallback((state: typeof module.state) => {
        if (state.paintFeature !== moduleState.paintFeature) {
            setVerticalZoom(module.verticalZoom[state.paintFeature]);
            setDefaultVerticalZoom(module.verticalZoom[state.paintFeature]);
            setVerticalOffset(module.verticalOffset[state.paintFeature]);
            setDefaultVerticalOffset(module.verticalOffset[state.paintFeature]);
        }
        module.setState(state);
    }, [module, moduleState]);
    const optionsMetadata = module.getOptionsMetadata();
    const configurationContent = <ConfigurationContent {...{ moduleId: module.moduleId, essentiaState, setEssentiaState, moduleState, setModuleState, optionsMetadata }} />;
    const monitorContent = dataSlices?.length ? (
        <div className="default-layout">
            {
                cursorInfo
                ? <>
                    <div>Channel: {cursorInfo.channel + 1}</div>
                    {
                        "fromBin" in cursorInfo && module.featureOutputsMatrix(moduleState.paintFeature)
                        ? <>
                            <div>Bin:</div>
                            <div>{cursorInfo.fromBin} to {cursorInfo.toBin}</div>
                            <div style={{ color: moduleState.color }}>Value:</div>
                            <div style={{ color: moduleState.color }}>{(cursorInfo.value).toFixed(3)} {module.matrixUnit[moduleState.paintFeature]}</div>
                        </> 
                        : <>
                            <div style={{ color: moduleState.color }}>Value:</div>
                            <div style={{ color: moduleState.color }}>{typeof cursorInfo.value === "number" ? `${(cursorInfo.value).toFixed(3)} ${module.horizontalRulerUnit[moduleState.paintFeature]}` : cursorInfo.value.map(v => `${v.toFixed(3)} ${module.horizontalRulerUnit[moduleState.paintFeature]}`).join(" to ")}</div>
                        </>
                    }
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
