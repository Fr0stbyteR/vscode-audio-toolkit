import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Module from "./Vibrato";
import VectorImageProcessor, { VectorDataSlice } from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import ConfigurationContent from "./ConfigurationContent";

const Component: FunctionComponent<VisualizationOptions<Module>> = (props) => {
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const defaultVerticalZoom = 2 / (moduleState.paintOption === "extend" ? moduleState.maxExtend : moduleState.maxFrequency);
    const defaultVerticalOffset = 1;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const [cursorX, setCursorX] = useState<number | undefined>();
    const [cursorY, setCursorY] = useState<number | undefined>();
    const [cursorInfo, setCursorInfo] = useState<{ channel: number; extend: number | [number, number]; frequency: number | [number, number] } | null>(null);
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
        const { color, paintOption } = moduleState;
        let ds: VectorDataSlice[];
        if (paintOption === "extend") ds = dataSlices.map(ds => ds.vibratoExtend);
        else ds = dataSlices.map(ds => ds.vibratoFrequency);
        // else ds = dataSlices.map(ds => ({ ...ds.vibratoExtend, vectors: ds.vibratoExtend.vectors.map((v, i) => [v, ds.vibratoFrequency.vectors[i]]).flat(), resizedVectors: { ...ds.vibratoExtend.resizedVectors, resizes: ds.vibratoExtend.resizedVectors.resizes.map((v, i) => [v, ds.vibratoFrequency.resizedVectors.resizes[i]]).flat() } }));
        VectorImageProcessor.paint(ctx, ds, { width, height, verticalZoom, verticalOffset, beforeAndAfter: "none", confidenceThreshold: 0.001 }, { viewRange }, { phosphorColor: color });
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
        const labelUnit = moduleState.paintOption === "extend" ? "cents" : "Hz";
        VectorImageProcessor.paintHorizontalRuler(ctx, module.audioEditor.numberOfChannels, { width, height, verticalZoom, verticalOffset, labelMode: "linear", labelUnit, labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [module, moduleState, verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (y < 0 || y > height) setCursorY(undefined);
        if (x < 0 || x > width) {
            setCursorX(undefined);
            setCursorY(undefined);
            setCursorInfo(null);
            return;
        }
        if (!dataSlices?.length) return;
        const ds = dataSlices.map(ds => ({ ...ds.vibratoExtend, vectors: ds.vibratoExtend.vectors.map((v, i) => [v, ds.vibratoFrequency.vectors[i]]).flat(), resizedVectors: { ...ds.vibratoExtend.resizedVectors, resizes: ds.vibratoExtend.resizedVectors.resizes.map((v, i) => [v, ds.vibratoFrequency.resizedVectors.resizes[i]]).flat() } }));

        const info = VectorImageProcessor.getInfoFromCursor(dataSlices.map(ds => ds.vibratoExtend), x, y, { width, height, verticalZoom, verticalOffset}, { viewRange });
        const { value: frequency } = VectorImageProcessor.getInfoFromCursor(dataSlices.map(ds => ds.vibratoFrequency), x, y, { width, height, verticalZoom, verticalOffset}, { viewRange });
        setCursorX(info.x);
        setCursorY(info.y);
        setCursorInfo({ channel: info.channel, extend: info.value, frequency });
    }, [dataSlices, verticalOffset, verticalZoom, viewRange]);
    const setModuleState = useCallback((state: typeof module.state) => {
        if (state.paintOption !== moduleState.paintOption) setVerticalZoom(2 / (state.paintOption === "extend" ? state.maxExtend : state.maxFrequency));
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
                    <div style={{ color: moduleState.color }}>Extend:</div>
                    <div style={{ color: moduleState.color }}>{typeof cursorInfo.extend === "number" ? `${(cursorInfo.extend).toFixed(0)} cents` : cursorInfo.extend.map(v => `${v.toFixed(0)} cents`).join(" to ")}</div>
                    <div style={{ color: moduleState.color }}>Frequency:</div>
                    <div style={{ color: moduleState.color }}>{typeof cursorInfo.frequency === "number" ? `${cursorInfo.frequency.toFixed(3)} Hz` : cursorInfo.frequency.map(v => `${v.toFixed(3)} Hz`).join(" to ")}</div>
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
