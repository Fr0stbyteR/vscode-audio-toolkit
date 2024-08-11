import { FunctionComponent, useCallback, useEffect, useId, useState } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Module from "./LoudnessEBUR128";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import ConfigurationContent from "./ConfigurationContent";

const Component: FunctionComponent<VisualizationOptions<Module>> = (props) => {
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const defaultVerticalZoom = 0.02;
    const defaultVerticalOffset = -1;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const [cursorX, setCursorX] = useState<number | undefined>();
    const [cursorY, setCursorY] = useState<number | undefined>();
    const [cursorInfo, setCursorInfo] = useState<{ momentary: number | [number, number], shortTerm: number | [number, number] } | null>(null);
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
        const { paintMomentaryLoudness, paintShortTermLoudness, paintIntegratedLoudness, momentaryLoudnessColor, shortTermLoudnessColor, integratedLoudnessColor } = moduleState;
        if (paintMomentaryLoudness) VectorImageProcessor.paint(ctx, dataSlices.map(ds => ds.momentaryLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit", paintOver: true }, { viewRange }, { phosphorColor: momentaryLoudnessColor });
        if (paintShortTermLoudness) VectorImageProcessor.paint(ctx, dataSlices.map(ds => ds.shortTermLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit", paintOver: true }, { viewRange }, { phosphorColor: shortTermLoudnessColor });
        if (paintIntegratedLoudness) VectorImageProcessor.paint(ctx, dataSlices.map(ds => ds.integratedLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit", paintOver: true }, { viewRange }, { phosphorColor: integratedLoudnessColor });
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
        VectorImageProcessor.paintHorizontalRuler(ctx, 1, { width, height, verticalZoom, verticalOffset, labelMode: "linear", labelUnit: "dB", labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (y < 0 || y > height) setCursorY(undefined);
        if (x < 0 || x > width) {
            setCursorX(undefined);
            setCursorY(undefined);
            setCursorInfo(null);
            return;
        }
        if (!dataSlices?.length) return;
        const info = VectorImageProcessor.getInfoFromCursor(dataSlices.map(ds => ds.momentaryLoudnessDataSlice), x, y, { width, height, verticalZoom, verticalOffset}, { viewRange });
        const { value: shortTerm } = VectorImageProcessor.getInfoFromCursor(dataSlices.map(ds => ds.shortTermLoudnessDataSlice), x, y, { width, height, verticalZoom, verticalOffset}, { viewRange });
        setCursorX(info.x);
        setCursorY(info.y);
        setCursorInfo({ momentary: info.value, shortTerm });
    }, [dataSlices, verticalOffset, verticalZoom, viewRange]);
    const setModuleState = useCallback((state: typeof module.state) => module.setState(state), [module]);
    const optionsMetadata = module.getOptionsMetadata();
    const configurationContent = <ConfigurationContent {...{ moduleId: module.moduleId, essentiaState, setEssentiaState, moduleState, setModuleState, optionsMetadata }} />;
    const monitorContent = dataSlices?.length ? (
        <div className="default-layout">
            {
                cursorInfo
                ? <>
                    <div style={{ color: moduleState.momentaryLoudnessColor }}>Momentary loudness:</div>
                    <div style={{ color: moduleState.momentaryLoudnessColor }}>{typeof cursorInfo.momentary === "number" ? `${cursorInfo.momentary.toFixed(3)} dB` : cursorInfo.momentary.map(v => `${v.toFixed(3)} dB`).join(" to ")}</div>
                    <div style={{ color: moduleState.shortTermLoudnessColor }}>Short-term loudness:</div>
                    <div style={{ color: moduleState.shortTermLoudnessColor }}>{typeof cursorInfo.shortTerm === "number" ? `${cursorInfo.shortTerm.toFixed(3)} dB` : cursorInfo.shortTerm.map(v => `${v.toFixed(3)} dB`).join(" to ")}</div>
                </>
                : null
            }
            <div style={{ color: moduleState.integratedLoudnessColor }}>Integrated loudness:</div>
            <div style={{ color: moduleState.integratedLoudnessColor }}>{dataSlices[0].integratedLoudnessDataSlice.vectors[0][0].toFixed(3)} dB</div>
            <div>Loudness Range:</div>
            <div>{dataSlices[0].loudnessRangeDataSlice.vectors[0][0].toFixed(3)} dB</div>
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
