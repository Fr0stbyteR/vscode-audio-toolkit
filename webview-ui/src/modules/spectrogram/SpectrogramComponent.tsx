
import "./SpectrogramComponent.scss";
import { FunctionComponent, useCallback, useContext, useState } from "react";
import { AudioEditorContext } from "../../components/contexts";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Spectrogram from "./Spectrogram";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import MatrixImageProcessor from "../../core/MatrixImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";

const SpectrogramComponent: FunctionComponent<VisualizationOptions<Spectrogram>> = (props) => {
    const { module, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const defaultVerticalOffset = 0;
    const defaultVerticalZoom = 1;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const paint = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        MatrixImageProcessor.paint(ctx, module.dataSlices, { width, height, verticalZoom, verticalOffset }, { viewRange }, {});
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
        VectorImageProcessor.paintHorizontalRuler(ctx, module.audioEditor.numberOfChannels, { width, height, verticalZoom: verticalZoom / (audioEditor.sampleRate / 2 / 2), verticalOffset: verticalOffset + 1, labelMode: "linear", labelUnit: "Hz", labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [audioEditor, module, verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const configurationContent = (
        <div className="spectrogram-configuration">
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

export default SpectrogramComponent;
