
import "./SpectrogramComponent.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useState } from "react";
import { AudioEditorContext } from "../../components/contexts";
import { setCanvasToFullSize } from "../../utils";
import { VISUALIZER_RULER_WIDTH, VisualizationOptions } from "../../core/AudioToolkitModule";
import Spectrogram from "./Spectrogram";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import MatrixImageProcessor, { MatrixCursorInfo } from "../../core/MatrixImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import ModuleConfigurationContent from "../../components/ModuleConfigurationContent";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

const SpectrogramComponent: FunctionComponent<VisualizationOptions<Spectrogram>> = (props) => {
    const { module, moduleState, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const defaultVerticalOffset = 0;
    const defaultVerticalZoom = 1;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const [cursorX, setCursorX] = useState<number | undefined>();
    const [cursorY, setCursorY] = useState<number | undefined>();
    const [cursorInfo, setCursorInfo] = useState<MatrixCursorInfo | null>(null);
    const [dataSlices, setDataSlices] = useState<typeof module.dataSlices>(module.dataSlices);
    const [calculationState, setCalculationState] = useState(module.getCalculationState(moduleState));
    const [calculating, setCalculating] = useState<boolean | [number, string]>(module.isCalculating);
    const handleDataChange = useCallback((dataSlices: typeof module.dataSlices) => setDataSlices(dataSlices), [module]);
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
        MatrixImageProcessor.paint(ctx, dataSlices, { width, height, verticalZoom, verticalOffset, minValue: moduleState.minDB, maxValue: moduleState.maxDB }, { viewRange }, {});
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
        VectorImageProcessor.paintHorizontalRuler(ctx, module.audioEditor.numberOfChannels, { width, height, verticalZoom: verticalZoom / (audioEditor.sampleRate / 2 / 2), verticalOffset: verticalOffset + 1, labelMode: "linear", labelUnit: "Hz", labelsWidth: VISUALIZER_RULER_WIDTH }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [audioEditor, module, verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (x < 0 || x > width || y < 0 || y > height) {
            setCursorX(undefined);
            setCursorY(undefined);
            setCursorInfo(null);
            return;
        }
        if (!dataSlices?.length) return;
        const info = MatrixImageProcessor.getInfoFromCursor(dataSlices, x, y, { width, height, verticalZoom, verticalOffset }, { viewRange });
        setCursorX(info.x);
        setCursorY(info.y);
        setCursorInfo(info);
    }, [dataSlices, verticalOffset, verticalZoom, viewRange]);
    const setModuleState = useCallback((state: typeof module.state) => module.setState(state), [module]);
    const optionsMetadata = module.getOptionsMetadata();
    const calculationStateKeys = Object.keys(calculationState);
    const configurationContent = (
        <div className={`default-layout ${module.moduleId.replace(".", "-")}-configuration`}>
            <div className="configuration-kind"><strong>{props.configurationMode === "analysis" ? "Analysis" : "Appearance"}</strong><span>{props.configurationMode === "analysis" ? "Changes apply when you recalculate." : "Changes apply instantly."}</span></div>
            {props.configurationMode === "analysis" ? <>
                <ModuleConfigurationContent {...{ moduleId: module.moduleId, moduleState: calculationState, setModuleState: setCalculationState, keys: calculationStateKeys, optionsMetadata, wrap: false }} />
                <div><VSCodeButton tabIndex={-1} title="Recalculate spectrogram" appearance="primary" onClick={() => setModuleState({ ...moduleState, ...calculationState })}>Recalculate</VSCodeButton></div>
            </> : <ModuleConfigurationContent {...{ moduleId: module.moduleId, moduleState, setModuleState, keys: Object.keys(moduleState).filter(k => calculationStateKeys.indexOf(k) === -1), optionsMetadata, wrap: false }} />}
        </div>
    );
    const monitorContent = (
        <div className="default-layout">
            <div>FFT size: {configuration.fftSize}</div>
            <div>FFT overlaps: {configuration.fftOverlap}</div>
            <div>FFT window: {configuration.fftWindowFunction}</div>
            <br />
            {
                cursorInfo
                ? <>
                    <div>Channel: {cursorInfo.channel + 1}</div>
                    <div>Sample index:</div>
                    <div>{cursorInfo.fromIndex} to {cursorInfo.fromIndex + configuration.fftSize}</div>
                    <div>FFT bin:</div>
                    <div>{cursorInfo.fromBin} to {cursorInfo.toBin}</div>
                    <div>Frequency:</div>
                    <div>{((cursorInfo.fromBin / configuration.fftSize) * audioEditor.sampleRate).toFixed(3)} to {((cursorInfo.toBin / configuration.fftSize) * audioEditor.sampleRate).toFixed(3)} Hz</div>
                    <div>Value:</div>
                    <div>{cursorInfo.value.toFixed(3)} dB</div>
                </>
                : null
            }
        </div>
    );
    const moduleUsingCanvasProps = {
        calculating,
        defaultVerticalOffset, verticalOffset, setVerticalOffset,
        defaultVerticalZoom, verticalZoom, setVerticalZoom,
        cursorX, cursorY, onCursor,
        paint, paintVerticalRuler, paintHorizontalRuler,
        configurationContent, monitorContent,
        ...props
    };
    return (
        <ModuleUsingCanvas {...moduleUsingCanvasProps} />
    );
};

export default SpectrogramComponent;
