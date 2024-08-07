
import "./SpectrogramComponent.scss";
import { FunctionComponent, useCallback, useContext, useState } from "react";
import { AudioEditorContext } from "../../components/contexts";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Spectrogram from "./Spectrogram";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import MatrixImageProcessor, { MatrixCursorInfo } from "../../core/MatrixImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";

const SpectrogramComponent: FunctionComponent<VisualizationOptions<Spectrogram>> = (props) => {
    const { module, viewRange, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const defaultVerticalOffset = 0;
    const defaultVerticalZoom = 1;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const [cursorX, setCursorX] = useState<number | undefined>();
    const [cursorY, setCursorY] = useState<number | undefined>();
    const [cursorInfo, setCursorInfo] = useState<MatrixCursorInfo | null>(null);
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
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [module, viewRange, configuration, gridColor]);
    const paintHorizontalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintHorizontalRuler(ctx, module.audioEditor.numberOfChannels, { width, height, verticalZoom: verticalZoom / (audioEditor.sampleRate / 2 / 2), verticalOffset: verticalOffset + 1, labelMode: "linear", labelUnit: "Hz", labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [audioEditor, module, verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const onCursor = useCallback((x: number, y: number, width: number, height: number) => {
        if (x < 0 || x > width || y < 0 || y > height) {
            setCursorX(undefined);
            setCursorY(undefined);
            setCursorInfo(null);
            return;
        }
        const info = MatrixImageProcessor.getInfoFromCursor(module.dataSlices, x, y, { width, height, verticalZoom, verticalOffset}, { viewRange });
        setCursorX(info.x);
        setCursorY(info.y);
        setCursorInfo(info);
    }, [module, verticalOffset, verticalZoom, viewRange]);
    const configurationContent = (
        <div className="spectrogram-configuration">
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
