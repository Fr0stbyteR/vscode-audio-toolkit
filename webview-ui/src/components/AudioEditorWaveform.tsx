import "./AudioEditorWaveform.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef } from "react";
import { AudioEditorContext } from "./contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { setCanvasToFullSize } from "../utils";
import { VisualizationOptions } from "../core/AudioToolkitModule";

interface Props extends Omit<VisualizationOptions<any>, "module" | "moduleIndex"> {}

const AudioEditorWaveform: FunctionComponent<Props> = ({ viewRange, selRange, playhead, enabledChannels, phosphorColor, playheadColor, gridColor, gridRulerColor, textColor, monospaceFont, configuration: { audioUnit, beatsPerMinute, beatsPerMeasure, division }, rerenderTimestamp }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const canvasHorizontalRulerRef = useRef<HTMLCanvasElement>(null);
    const divMainRef = useRef<HTMLDivElement>(null);
    // const divSelRangeRef = useRef<HTMLDivElement>(null);
    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        audioEditor.waveform.paint(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, { viewRange }, { playheadColor, phosphorColor });
    }, [audioEditor, viewRange, playheadColor, phosphorColor]);
    const paintVerticalRuler = useCallback(() => {
        const canvas = canvasVerticalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        audioEditor.waveform.paintVerticalRuler(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, { viewRange, audioUnit, beatsPerMeasure, beatsPerMinute, division }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont, paintGridLabels: false });
    }, [audioEditor, viewRange, audioUnit, beatsPerMeasure, beatsPerMinute, division, gridColor, gridRulerColor, textColor, monospaceFont]);
    const paintHorizontalRuler = useCallback(() => {
        const canvas = canvasHorizontalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        audioEditor.waveform.paintHorizontalRuler(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, null, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont, paintGridLabels: true });
    }, [audioEditor, gridColor, gridRulerColor, textColor, monospaceFont]);
    useEffect(paint, [paint, rerenderTimestamp]);
    useEffect(paintVerticalRuler, [paintVerticalRuler, rerenderTimestamp]);
    useEffect(paintHorizontalRuler, [paintHorizontalRuler, rerenderTimestamp]);
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const origin = { x: e.clientX, y: e.clientY };
        const rect = e.currentTarget.getBoundingClientRect();
        const playhead = viewStart + (e.clientX - rect.left) / rect.width * viewLength;
        audioEditor.setPlayhead(playhead);
        audioEditor.setSelRange(null);
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const x = e.clientX;
            if (x === origin.x) {
                audioEditor.setSelRange(null);
            } else {
                if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
                else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
                const [viewStart, viewEnd] = audioEditor.state.viewRange;
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
    }, [audioEditor, viewRange]);
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (!e.deltaX && !e.deltaY) return;
        let divMainFlexContainer = e.currentTarget.parentElement;
        while (divMainFlexContainer && !divMainFlexContainer.classList.contains("editor-main-flex")) {
            divMainFlexContainer = divMainFlexContainer.parentElement;
        }
        if (divMainFlexContainer && divMainFlexContainer.scrollHeight > divMainFlexContainer.clientHeight) return;
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
    }, [audioEditor, viewRange]);
    const handleResizeStartMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();
        const end = selRange[1];
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (e.movementX) {
                const x = e.clientX;
                if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
                else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
                const [viewStart, viewEnd] = audioEditor.state.viewRange;
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
    }, [audioEditor, selRange]);
    const handleResizeEndMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();
        const start = selRange[0];
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (e.movementX) {
                const x = e.clientX;
                if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
                else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
                const [viewStart, viewEnd] = audioEditor.state.viewRange;
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
    }, [audioEditor, selRange]);
    const [viewStart, viewEnd] = viewRange;
    const viewLength = viewEnd - viewStart;
    const [selStart, selEnd] = selRange || [0, 0];
    const $selStart = (selStart - viewStart) / viewLength;
    const $selEnd = (selEnd - viewStart) / viewLength;
    const selLeft = `${$selStart * 100}%`;
    const selWidth = `${($selEnd - $selStart) * 100}%`;
    const $playhead = (playhead - viewStart) / viewLength;
    const playheadLeft = `${$playhead * 100}%`;
    return (
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
            <div className="editor-main-playhead-container">
                {$playhead > 1 || $playhead < 0 ? null : <div className="editor-main-playhead" style={{ left: playheadLeft }} />}
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
        </div>
    );
};

export default AudioEditorWaveform;
