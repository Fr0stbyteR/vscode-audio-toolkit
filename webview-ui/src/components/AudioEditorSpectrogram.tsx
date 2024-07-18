
import "./AudioEditorSpectrogram.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef } from "react";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { AudioEditorContext } from "./contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { SpectrogramPaintOptions } from "../core/Spectrogram";
import { setCanvasToFullSize } from "../utils";

interface Props extends Pick<AudioEditorState, "selRange" | "viewRange" | "enabledChannels">, Partial<SpectrogramPaintOptions> {
    configuration: AudioEditorConfiguration;
    monospaceFont: string;
    windowSize: number[];
}

const AudioEditorSpectrogram: FunctionComponent<Props> = ({ viewRange, selRange, enabledChannels, phosphorColor, cursorColor, gridColor, gridRulerColor, textColor, monospaceFont, configuration: { audioUnit, beatsPerMinute, beatsPerMeasure, division }, windowSize }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const canvasHorizontalRulerRef = useRef<HTMLCanvasElement>(null);
    const divMainRef = useRef<HTMLDivElement>(null);
    const divSelRangeRef = useRef<HTMLDivElement>(null);
    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        audioEditor.spectrogram.paint(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, { viewRange }, { cursorColor, phosphorColor });
    }, [viewRange, cursorColor, phosphorColor]);
    const paintVerticalRuler = useCallback(() => {
        const canvas = canvasVerticalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        audioEditor.waveform.paintVerticalRuler(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, { viewRange, audioUnit, beatsPerMeasure, beatsPerMinute, division }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont, paintGridLabels: false });
    }, [viewRange, audioUnit, beatsPerMeasure, beatsPerMinute, division, gridColor, gridRulerColor, textColor, monospaceFont]);
    const paintHorizontalRuler = useCallback(() => {
        const canvas = canvasHorizontalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        audioEditor.spectrogram.paintHorizontalRuler(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, null, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont, paintGridLabels: true });
    }, [gridColor, gridRulerColor,  textColor, monospaceFont]);
    useEffect(paint, [paint, windowSize]);
    useEffect(paintVerticalRuler, [paintVerticalRuler, windowSize]);
    useEffect(paintHorizontalRuler, [paintHorizontalRuler, windowSize]);
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const origin = { x: e.clientX, y: e.clientY };
        const rect = e.currentTarget.getBoundingClientRect();
        const playhead = viewStart + (e.clientX - rect.left) / rect.width * viewLength;
        audioEditor.setCursor(playhead);
        audioEditor.setSelRange(null);
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const x = e.clientX;
            if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
            else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
            if (x === origin.x) {
                audioEditor.setSelRange(null);
            } else {
                const [viewStart, viewEnd] = viewRange;
                const viewLength = viewEnd - viewStart;
                const to = viewStart + Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * viewLength;
                audioEditor.setSelRange([playhead, to]);
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            audioEditor.emitSelRangeToPlay();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [viewRange]);
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            audioEditor.scrollH(e.deltaX > 0 ? 0.01 : -0.01);
            return;
        }
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const origin = { x: e.clientX, y: e.clientY };
        const rect = e.currentTarget.getBoundingClientRect();
        const ref = viewStart + (origin.x - rect.left) / rect.width * viewLength;
        audioEditor.zoomH(ref, e.deltaY < 0 ? 1 : -1);
    }, [viewRange]);
    const handleResizeStartMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();
        const end = selRange[1];
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (divSelRangeRef.current && e.movementX) {
                const x = e.clientX;
                if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
                else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
                const [viewStart, viewEnd] = viewRange;
                const viewLength = viewEnd - viewStart;
                const start = viewStart + (x - rect.left) / rect.width * viewLength;
                audioEditor.setSelRange([start, end]);
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            audioEditor.emitSelRangeToPlay();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [selRange, viewRange]);
    const handleResizeEndMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();
        const start = selRange[0];
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (divSelRangeRef.current && e.movementX) {
                const x = e.clientX;
                if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
                else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
                const [viewStart, viewEnd] = viewRange;
                const viewLength = viewEnd - viewStart;
                const end = viewStart + (x - rect.left) / rect.width * viewLength;
                audioEditor.setSelRange([start, end]);
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            audioEditor.emitSelRangeToPlay();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [selRange, viewRange]);
    const [viewStart, viewEnd] = viewRange;
    const viewLength = viewEnd - viewStart;
    const [selStart, selEnd] = selRange || [0, 0];
    const $selStart = (selStart - viewStart) / viewLength;
    const $selEnd = (selEnd - viewStart) / viewLength;
    const selLeft = `${$selStart * 100}%`;
    const selWidth = `${($selEnd - $selStart) * 100}%`;
    return (
        <div className="editor-main-spectrogram-container">
            <div className="editor-main-spectrogram-background" />
            <div className="editor-main-spectrogram-vertical-ruler-container">
                <canvas ref={canvasVerticalRulerRef} />
            </div>
            <div className="editor-main-spectrogram-horizontal-ruler-container">
                <canvas ref={canvasHorizontalRulerRef} />
            </div>
            <div ref={divMainRef} className="editor-main-spectrogram-canvas-container" onMouseDown={handleCanvasMouseDown} onWheel={handleWheel}>
                <canvas ref={canvasRef} />
                <div className="editor-main-selrange" style={{ left: selLeft, width: selWidth }} hidden={!selRange}>
                    <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                    <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                </div>
            </div>
        </div>
    );
};

export default AudioEditorSpectrogram;
