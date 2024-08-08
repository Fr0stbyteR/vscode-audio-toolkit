import "./LoudnessEBUR128Component.scss";
import { FunctionComponent, useCallback, useEffect, useId, useState } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Module from "./LoudnessEBUR128";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";
import { VSCodeButton, VSCodeCheckbox, VSCodeDivider } from "@vscode/webview-ui-toolkit/react";

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
    const [hopSize, setHopSize] = useState(moduleState.hopSize);
    const [startAtZero, setStartAtZero] = useState(moduleState.startAtZero);
    const [dataSlices, setDataSlices] = useState<typeof module.dataSlices | null>(module.dataSlices);
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
    const handleClickCalculate = useCallback(() => {
        module.setState({ ...moduleState, hopSize, startAtZero });
    }, [hopSize, startAtZero, module, moduleState]);
    const [id1, id2, id3, id4] = [useId(), useId(), useId(), useId()];
    const configurationContent = (
        <div className={`default-layout ${module.moduleId.replace(".", "-")}-configuration`}>
            <div>
                <label htmlFor={id1}>Hop Size (sec)</label>
                <input type="number" min={0.001} step={0.001} max={0.1} onChange={e => setHopSize(e.currentTarget.valueAsNumber)} value={hopSize} />
            </div>
            <div>
                <VSCodeCheckbox checked={startAtZero} onChange={e => setStartAtZero((e.currentTarget as HTMLInputElement).checked)}>Start at Zero</VSCodeCheckbox>
            </div>
            <div>
                <VSCodeButton tabIndex={-1} title="Submit for Calculate" appearance="primary" onClick={handleClickCalculate}>Calculate</VSCodeButton>
            </div>
            <VSCodeDivider />
            <div>
                <VSCodeCheckbox checked={moduleState.paintMomentaryLoudness} onChange={e => module.setState({ ...moduleState, paintMomentaryLoudness: (e.currentTarget as HTMLInputElement).checked })}>Show momentary loudness</VSCodeCheckbox>
            </div>
            <div>
                <label htmlFor={id2}>Color</label>
                <input type="color" value={moduleState.momentaryLoudnessColor} id={id2} onChange={e => module.setState({ ...moduleState, momentaryLoudnessColor: (e.currentTarget as HTMLInputElement).value })} />
            </div>
            <div>
                <VSCodeCheckbox checked={moduleState.paintShortTermLoudness} onChange={e => module.setState({ ...moduleState, paintShortTermLoudness: (e.currentTarget as HTMLInputElement).checked })}>Show short-term loudness</VSCodeCheckbox>
            </div>
            <div>
                <label htmlFor={id3}>Color</label>
                <input type="color" value={moduleState.shortTermLoudnessColor} id={id3} onChange={e => module.setState({ ...moduleState, shortTermLoudnessColor: (e.currentTarget as HTMLInputElement).value })} />
            </div>
            <div>
                <VSCodeCheckbox checked={moduleState.paintIntegratedLoudness} onChange={e => module.setState({ ...moduleState, paintIntegratedLoudness: (e.currentTarget as HTMLInputElement).checked })}>Show integrated loudness</VSCodeCheckbox>
            </div>
            <div>
                <label htmlFor={id4}>Color</label>
                <input type="color" value={moduleState.integratedLoudnessColor} id={id4} onChange={e => module.setState({ ...moduleState, integratedLoudnessColor: (e.currentTarget as HTMLInputElement).value })} />
            </div>
        </div>
    );
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
            <div>{dataSlices[0].loudnessRange.toFixed(3)} dB</div>
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
