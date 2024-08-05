import "./LoudnessEBUR128Component.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AudioEditorContext } from "../../components/contexts";
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Module from "./LoudnessEBUR128";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";

const Component: FunctionComponent<VisualizationOptions<Module>> = (props) => {
    const { module, viewRange, enabledChannels, phosphorColor, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const defaultVerticalZoom = 0.02;
    const defaultVerticalOffset = -1;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const paint = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        if (!module.dataSlices.length) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paint(ctx, module.dataSlices.map(ds => ds.momentaryLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit" }, { viewRange }, { phosphorColor: "#FF0000" });
        VectorImageProcessor.paint(ctx, module.dataSlices.map(ds => ds.shortTermLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit", paintOver: true }, { viewRange }, { phosphorColor: "#00FF00" });
        VectorImageProcessor.paint(ctx, module.dataSlices.map(ds => ds.integratedLoudnessDataSlice), { width, height, verticalZoom, verticalOffset, beforeAndAfter: "inherit", paintOver: true }, { viewRange }, { phosphorColor: "#0000FF" });
    }, [module, verticalZoom, verticalOffset, viewRange]);
    const paintVerticalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [module, viewRange, configuration, gridColor, gridRulerColor, textColor, monospaceFont]);
    const paintHorizontalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintHorizontalRuler(ctx, 1, { width, height, verticalZoom, verticalOffset, labelMode: "linear", labelUnit: "dB", labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const configurationContent = (
        <div className="loudnessebur128-configuration">
        </div>
    );
    const moduleUsingCanvasProps = {
        defaultVerticalOffset, verticalOffset, setVerticalOffset,
        defaultVerticalZoom, verticalZoom, setVerticalZoom,
        paint, paintVerticalRuler, paintHorizontalRuler,
        configurationContent,
        ...props
    };
    return (
        <ModuleUsingCanvas {...moduleUsingCanvasProps} />
    );
};

export default Component;
