import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Module from "./PitchYinProbabilistic";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import ConfigurationContent from "./ConfigurationContent";

const Component: FunctionComponent<VisualizationOptions<Module>> = (props) => {
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const defaultVerticalZoom = 2 / 4000;
    const defaultVerticalOffset = 1;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const [cursorX, setCursorX] = useState<number | undefined>();
    const [cursorY, setCursorY] = useState<number | undefined>();
    const [cursorInfo, setCursorInfo] = useState<{ channel: number; pitch: number | [number, number]; probability: number | [number, number] } | null>(null);
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
        const { color, probabilitiesColor, paintProbabilities } = moduleState;
        if (paintProbabilities) VectorImageProcessor.paint(ctx, dataSlices.map(ds => ds.voicedProbabilities), { width, height, verticalZoom: 2 / 1, verticalOffset: 1, beforeAndAfter: "inherit" }, { viewRange }, { phosphorColor: probabilitiesColor });
        VectorImageProcessor.paint(ctx, dataSlices.map(ds => ds.pitch), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "none", confidenceDataSlices: dataSlices.map(ds => ds.voicedProbabilities), confidenceThreshold: moduleState.paintThreshold, paintOver: paintProbabilities }, { viewRange }, { phosphorColor: color });
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
        VectorImageProcessor.paintHorizontalRuler(ctx, module.audioEditor.numberOfChannels, { width, height, verticalZoom, verticalOffset, labelMode: "linear", labelUnit: "dB", labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
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
        const info = VectorImageProcessor.getInfoFromCursor(dataSlices.map(ds => ds.pitch), x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
        const { value: probability } = VectorImageProcessor.getInfoFromCursor(dataSlices.map(ds => ds.voicedProbabilities), x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
        setCursorX(info.x);
        setCursorY(info.y);
        setCursorInfo({ channel: info.channel, pitch: info.value, probability });
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
                    <div style={{ color: moduleState.color }}>Pitch:</div>
                    <div style={{ color: moduleState.color }}>{typeof cursorInfo.pitch === "number" ? `${cursorInfo.pitch.toFixed(3)} Hz` : cursorInfo.pitch.map(v => `${v.toFixed(3)} Hz`).join(" to ")}</div>
                    <div style={{ color: moduleState.probabilitiesColor }}>Voiced Probability:</div>
                    <div style={{ color: moduleState.probabilitiesColor }}>{typeof cursorInfo.probability === "number" ? `${(cursorInfo.probability * 100).toFixed(3)}%` : cursorInfo.probability.map(v => `${(v * 100).toFixed(3)}%`).join(" to ")}</div>
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
