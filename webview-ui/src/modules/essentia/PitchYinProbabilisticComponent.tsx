import { FunctionComponent, useCallback, useEffect, useId, useState } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Module from "./PitchYinProbabilistic";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import { VSCodeButton, VSCodeCheckbox, VSCodeDivider, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";

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
    const [hopSize, setHopSize] = useState(moduleState.hopSize);
    const [frameSize, setFrameSize] = useState(moduleState.frameSize);
    const [lowRMSThreshold, setLowRMSThreshold ] = useState(moduleState.lowRMSThreshold);
    const [outputUnvoiced, setOutputUnvoiced ] = useState(moduleState.outputUnvoiced);
    const [preciseTime, setPreciseTime] = useState(moduleState.preciseTime);
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
        const info = VectorImageProcessor.getInfoFromCursor(dataSlices.map(ds => ds.pitch), x, y, { width, height, verticalZoom, verticalOffset}, { viewRange });
        const { value: probability } = VectorImageProcessor.getInfoFromCursor(dataSlices.map(ds => ds.voicedProbabilities), x, y, { width, height, verticalZoom, verticalOffset}, { viewRange });
        setCursorX(info.x);
        setCursorY(info.y);
        setCursorInfo({ channel: info.channel, pitch: info.value, probability });
    }, [dataSlices, verticalOffset, verticalZoom, viewRange]);
    const handleClickCalculate = useCallback(() => {
        module.setState({ ...moduleState, frameSize, hopSize, lowRMSThreshold, outputUnvoiced, preciseTime });
    }, [module, moduleState, frameSize, hopSize, lowRMSThreshold, outputUnvoiced, preciseTime]);
    const [id1, id2, id3, id4, id5, id6, id7] = [useId(), useId(), useId(), useId(), useId(), useId(), useId()];
    const configurationContent = (
        <div className={`default-layout ${module.moduleId.replace(".", "-")}-configuration`}>
            <div>
                <label htmlFor={id1}>Frame Size (samples)</label>
                <input type="number" min={1} step={1} max={module.audioEditor.sampleRate * 16} onChange={e => setFrameSize(e.currentTarget.valueAsNumber)} value={frameSize} />
            </div>
            <div>
                <label htmlFor={id2}>Hop Size (samples)</label>
                <input type="number" min={1} step={1} max={module.audioEditor.sampleRate * 16} onChange={e => setHopSize(e.currentTarget.valueAsNumber)} value={hopSize} />
            </div>
            <div>
                <label htmlFor={id3}>Low RMS Threshold</label>
                <input id={id3} type="number" min={0.001} step={0.001} max={1} onChange={e => setLowRMSThreshold(e.currentTarget.valueAsNumber)} value={lowRMSThreshold} />
            </div>
            <div>
                <label htmlFor={id4}>Output unvoiced</label>
                <VSCodeDropdown id={id4} value={outputUnvoiced} onInput={e => setOutputUnvoiced((e.currentTarget as HTMLInputElement).value as typeof outputUnvoiced)}>
                    <VSCodeOption value="zero">zero</VSCodeOption>
                    <VSCodeOption value="abs">abs</VSCodeOption>
                    <VSCodeOption value="negative">negative</VSCodeOption>
                </VSCodeDropdown>
            </div>
            <div>
                <VSCodeCheckbox checked={preciseTime} onChange={e => setPreciseTime((e.currentTarget as HTMLInputElement).checked)}>Precise Time</VSCodeCheckbox>
            </div>
            <div>
                <VSCodeButton tabIndex={-1} title="Submit for Calculate" appearance="primary" onClick={handleClickCalculate}>Calculate</VSCodeButton>
            </div>
            <VSCodeDivider />
            <div>
                <label htmlFor={id5}>Color</label>
                <input id={id5} type="color" value={moduleState.color} onChange={e => module.setState({ ...moduleState, color: e.currentTarget.value })} />
            </div>
            <div>
                <label htmlFor={id6}>Paint Voiced Threshold</label>
                <input id={id6} type="number" min={0.01} step={0.01} max={1} onChange={e => module.setState({ ...moduleState, paintThreshold: e.currentTarget.valueAsNumber })} value={lowRMSThreshold} />
            </div>
            <div>
                <VSCodeCheckbox checked={moduleState.paintProbabilities} onChange={e => module.setState({ ...moduleState, paintProbabilities: (e.currentTarget as HTMLInputElement).checked })}>Show Probabilities</VSCodeCheckbox>
            </div>
            <div>
                <label htmlFor={id7}>Probabilities Color</label>
                <input id={id7} type="color" value={moduleState.probabilitiesColor} onChange={e => module.setState({ ...moduleState, probabilitiesColor: e.currentTarget.value })} />
            </div>
        </div>
    );
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
