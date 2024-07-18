import "./AudioEditorMain.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef } from "react";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { WaveformPaintOptions } from "../core/Waveform";
import { AudioEditorContext } from "./contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

interface Props extends Pick<AudioEditorState, "cursor" | "selRange" | "viewRange" | "enabledChannels">, Partial<WaveformPaintOptions> {
    configuration: AudioEditorConfiguration;
    monospaceFont: string;
    windowSize: number[];
}

const AudioEditorMain: FunctionComponent<Props> = ({ cursor, viewRange, selRange, enabledChannels, phosphorColor, cursorColor, gridColor, gridRulerColor, textColor, monospaceFont, configuration: { audioUnit, beatsPerMinute, beatsPerMeasure, division }, windowSize }) => {
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
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const width = ~~(rect.width * ratio);
        const height = ~~(rect.height * ratio);
        if (ctx.canvas.width !== width) ctx.canvas.width = width;
        if (ctx.canvas.height !== height) ctx.canvas.height = height;
        ctx.scale(ratio, ratio);
        audioEditor.waveform.paint(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, { viewRange }, { cursorColor, phosphorColor });
    }, [viewRange, cursorColor, phosphorColor]);
    const paintVerticalRuler = useCallback(() => {
        const canvas = canvasVerticalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const width = ~~(rect.width * ratio);
        const height = ~~(rect.height * ratio);
        if (ctx.canvas.width !== width) ctx.canvas.width = width;
        if (ctx.canvas.height !== height) ctx.canvas.height = height;
        ctx.scale(ratio, ratio);
        audioEditor.waveform.paintVerticalRuler(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, { viewRange, audioUnit, beatsPerMeasure, beatsPerMinute, division }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont, paintGridLabels: true });
    }, [viewRange, audioUnit, beatsPerMeasure, beatsPerMinute, division, gridColor, gridRulerColor, textColor, monospaceFont]);
    const paintHorizontalRuler = useCallback(() => {
        const canvas = canvasHorizontalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const width = ~~(rect.width * ratio);
        const height = ~~(rect.height * ratio);
        if (ctx.canvas.width !== width) ctx.canvas.width = width;
        if (ctx.canvas.height !== height) ctx.canvas.height = height;
        ctx.scale(ratio, ratio);
        audioEditor.waveform.paintHorizontalRuler(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, null, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont, paintGridLabels: true });
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
    const handlePlayheadHandlerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();
        const { currentTarget } = e;
        if (currentTarget.classList.contains("editor-main-vertical-ruler-area")) {
            const [viewStart, viewEnd] = viewRange;
            const viewLength = viewEnd - viewStart;
            const playhead = viewStart + (e.clientX - rect.left) / rect.width * viewLength;
            audioEditor.setCursor(playhead);
        }
        if (currentTarget.classList.contains("editor-main-playhead-handler")) currentTarget.style.cursor = "grabbing";
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const x = e.clientX;
            if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
            else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
            const [viewStart, viewEnd] = viewRange;
            const viewLength = viewEnd - viewStart;
            const playhead = viewStart + (x - rect.left) / rect.width * viewLength;
            audioEditor.setCursor(playhead);
        };
        const handleMouseUp = (e: MouseEvent) => {
            if (currentTarget.classList.contains("editor-main-playhead-handler")) currentTarget.style.cursor = "";
            e.stopPropagation();
            e.preventDefault();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [viewRange]);
    const handleSelRangeMoveMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current || !divSelRangeRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const origin = { x: e.clientX, y: e.clientY };
        const parentRect = canvasRef.current.getBoundingClientRect();
        const rect = divSelRangeRef.current.getBoundingClientRect();
        const curLeft = rect.left - parentRect.left;
        const { length } = audioEditor;
        const selLength = selRange[1] - selRange[0];
        divSelRangeRef.current.style.cursor = "grabbing";
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (divSelRangeRef.current && e.movementX) {
                const x = e.clientX;
                if (x > parentRect.right) audioEditor.scrollH((x - parentRect.right) / 1000);
                else if (x < parentRect.left) audioEditor.scrollH((x - parentRect.left) / 1000);
                const [viewStart, viewEnd] = viewRange;
                const viewLength = viewEnd - viewStart;
                const left = curLeft + (x - origin.x);
                const startSample = Math.max(0, Math.min(length - selLength, viewStart + left / parentRect.width * viewLength));
                const endSample = startSample + selLength;
                audioEditor.setSelRange([startSample, endSample]);
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (divSelRangeRef.current) divSelRangeRef.current.style.cursor = "grab";
            audioEditor.emitSelRangeToPlay();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [selRange, viewRange]);
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
    const $playhead = (cursor - viewStart) / viewLength;
    const playheadLeft = `${$playhead * 100}%`;
    return (
        <div className="editor-main">
            <div className="editor-main-playhead-container" hidden={$playhead < 0 || $playhead > 1}>
                <div className="editor-main-playhead-handler" style={{ left: playheadLeft }} onMouseDown={handlePlayheadHandlerMouseDown} />
                <div className="editor-main-playhead" style={{ left: playheadLeft }}></div>
            </div>
            <div className="editor-main-waveform-container">
                <div className="editor-main-waveform-background" />
                <div className="editor-main-waveform-vertical-ruler-container">
                    <canvas ref={canvasVerticalRulerRef} />
                </div>
                <div className="editor-main-waveform-horizontal-ruler-container">
                    <canvas ref={canvasHorizontalRulerRef} />
                </div>
                <div ref={divMainRef} className="editor-main-waveform-canvas-container" onMouseDown={handleCanvasMouseDown} onWheel={handleWheel}>
                    <canvas ref={canvasRef} />
                    <div className="editor-main-selrange" style={{ left: selLeft, width: selWidth }} hidden={!selRange}>
                        <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                        <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                    </div>
                    {/*
                    <div className="editor-main-fades">
                        {viewStart === 0 ? <div title={this.strings.fadeIn} className="editor-main-fadein-handler" onMouseDown={this.handleFadeInMouseDown}><Icon name="adjust" inverted size="small" /></div> : undefined}
                        {viewEnd === l ? <div title={this.strings.fadeOut} className="editor-main-fadeout-handler" onMouseDown={this.handleFadeOutMouseDown}><Icon name="adjust" inverted size="small" /></div> : undefined}
                        {selRange ? <div title={this.strings.gain} className="editor-main-fade-handler" style={{ left: `${Math.max(10, Math.min(90, $selStart * 100))}%` }}><Icon name="adjust" inverted size="small" /><GainInputUI unit="dB" gain={this.state.fade || 0} onAdjust={this.handleFadeAdjust} onChange={this.handleFadeChange} /></div> : undefined}
                    </div>
                    */}
                </div>
                <div className="editor-main-channel-enabler">
                    {
                        enabledChannels.map((enabled, i) => (
                            <div key={i} {...(enabled ? {} : { className: "disabled" })}>
                                <span className="enable-channel">
                                    <VSCodeButton aria-label={`Enable / Disable Channel ${i + 1}`} title={`Enable / Disable Channel ${i + 1}`} className={enabled ? "active" : ""} appearance="icon" onClick={() => audioEditor.setEnabledChannel(i, !enabledChannels[i])}>
                                        <span>{i + 1}</span>
                                    </VSCodeButton>
                                </span>
                            </div>
                        ))
                    }
                </div>
                <div className="editor-main-vertical-ruler-area" onMouseDown={handlePlayheadHandlerMouseDown}>
                    <div className="editor-main-selrange-handler" ref={divSelRangeRef} style={{ left: selLeft, width: `calc(${selWidth} - 4px)` }} hidden={!selRange} >
                        <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                        <div className="editor-main-selrange-mover" onMouseDown={handleSelRangeMoveMouseDown} />
                        <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AudioEditorMain;
