import "./LoudnessEBUR128Component.scss";
import { FunctionComponent, useCallback, useId, useState } from "react";
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
    const [repaintId, setRepaintId] = useState(performance.now());
    const [hopSize, setHopSize] = useState(moduleState.hopSize);
    const [startAtZero, setStartAtZero] = useState(moduleState.startAtZero);
    module.onDataChange = useCallback(() => setRepaintId(performance.now()), []);
    const paint = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        if (!module.dataSlices.length) return;
        const [width, height] = setCanvasToFullSize(canvas);
        ctx.clearRect(0, 0, width, height);
        const { paintMomentaryLoudness, paintShortTermLoudness, paintIntegratedLoudness, momentaryLoudnessColor, shortTermLoudnessColor, integratedLoudnessColor } = moduleState;
        if (paintMomentaryLoudness) VectorImageProcessor.paint(ctx, module.dataSlices.map(ds => ds.momentaryLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit", paintOver: true }, { viewRange }, { phosphorColor: momentaryLoudnessColor });
        if (paintShortTermLoudness) VectorImageProcessor.paint(ctx, module.dataSlices.map(ds => ds.shortTermLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit", paintOver: true }, { viewRange }, { phosphorColor: shortTermLoudnessColor });
        if (paintIntegratedLoudness) VectorImageProcessor.paint(ctx, module.dataSlices.map(ds => ds.integratedLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit", paintOver: true }, { viewRange }, { phosphorColor: integratedLoudnessColor });
    }, [module, moduleState, verticalZoom, verticalOffset, viewRange]);
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
    const handleClickCalculate = useCallback(() => {
        module.setState({ ...moduleState, hopSize, startAtZero });
    }, [hopSize, startAtZero, module, moduleState]);
    const [id1, id2, id3, id4] = [useId(), useId(), useId(), useId()];
    const configurationContent = (
        <div className={`${module.moduleId.replace(".", "-")}-configuration`}>
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
    const moduleUsingCanvasProps = {
        defaultVerticalOffset, verticalOffset, setVerticalOffset,
        defaultVerticalZoom, verticalZoom, setVerticalZoom,
        paint, paintVerticalRuler, paintHorizontalRuler,
        configurationContent,
        repaintId,
        ...props
    };
    return (
        <ModuleUsingCanvas {...moduleUsingCanvasProps} />
    );
};

export default Component;
