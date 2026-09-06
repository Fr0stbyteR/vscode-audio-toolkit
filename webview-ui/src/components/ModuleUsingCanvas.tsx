import "./ModuleUsingCanvas.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { AudioToolkitModule, VisualizationOptions } from "../core/AudioToolkitModule";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { getCssFromPosition } from "../utils";

export interface ModuleUsingCanvasProps extends VisualizationOptions<AudioToolkitModule> {
    calculating?: boolean | [number, string];
    defaultVerticalZoom: number;
    verticalZoom: number,
    setVerticalZoom: React.Dispatch<React.SetStateAction<number>>,
    defaultVerticalOffset: number;
    verticalOffset: number,
    setVerticalOffset: React.Dispatch<React.SetStateAction<number>>,
    cursorX?: number;
    cursorY?: number;
    onCursor?: (x: number, y: number, width: number, height: number) => any;
    showChannelEnableOverlay?: boolean;
    backgroundOpacity?: number;
    foregroundOpacity?: number;
    paint: (canvasRef: React.RefObject<HTMLCanvasElement>) => void | Promise<void>;
    paintBackground?: (canvasRef: React.RefObject<HTMLCanvasElement>) => void | Promise<void>;
    paintVerticalRuler: (canvasRef: React.RefObject<HTMLCanvasElement>) => void | Promise<void>;
    paintHorizontalRuler: (canvasRef: React.RefObject<HTMLCanvasElement>) => void | Promise<void>;
    repaintId?: any;
    configurationContent?: JSX.Element;
    monitorContent?: JSX.Element;
}

const ModuleUsingCanvas: FunctionComponent<ModuleUsingCanvasProps> = (props) => {
    const {
        module, calculating,
        paint, paintBackground, paintVerticalRuler, paintHorizontalRuler,
        defaultVerticalZoom, verticalZoom, setVerticalZoom,
        defaultVerticalOffset, verticalOffset, setVerticalOffset,
        cursorX, cursorY, onCursor,
        showChannelEnableOverlay, backgroundOpacity, foregroundOpacity,
        configurationContent, monitorContent,
        viewRange, enabledChannels, selRange, playhead,
        configuring, monitoring, rerenderId, repaintId
    } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const canvasHorizontalRulerRef = useRef<HTMLCanvasElement>(null);
    const divMainRef = useRef<HTMLDivElement>(null);
    const [cursorLocked, setCursorLocked] = useState(false);
    const handleWindowKeyDown = useCallback((e: KeyboardEvent) => {
        if (monitoring && e.key === "l") setCursorLocked(l => !l);
    }, [monitoring]);
    const handleDocumentMouseMove = useCallback((e: MouseEvent) => {
        if (!canvasRef.current || !onCursor || !monitoring || cursorLocked) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.x;
        const y = e.clientY - rect.y;
        onCursor(x, y, ~~rect.width, ~~rect.height);
    }, [onCursor, monitoring, cursorLocked]);
    useEffect(() => {
        window.addEventListener("keydown", handleWindowKeyDown);
        document.addEventListener("mousemove", handleDocumentMouseMove);
        return () => {
            window.removeEventListener("keydown", handleWindowKeyDown);
            document.removeEventListener("mousemove", handleDocumentMouseMove);
        };
    }, [handleDocumentMouseMove, handleWindowKeyDown]);
    useEffect(() => {
        void Promise.resolve().then(() => paint(canvasRef)).catch(error => console.error("Canvas paint failed.", error));
    }, [paint, rerenderId, repaintId]);
    useEffect(() => {
        if (paintBackground) void Promise.resolve().then(() => paintBackground(backgroundCanvasRef)).catch(error => console.error("Canvas background paint failed.", error));
    }, [paintBackground, rerenderId, repaintId]);
    useEffect(() => {
        void Promise.resolve().then(() => paintVerticalRuler(canvasVerticalRulerRef)).catch(error => console.error("Canvas vertical ruler paint failed.", error));
    }, [paintVerticalRuler, rerenderId, repaintId]);
    useEffect(() => {
        void Promise.resolve().then(() => paintHorizontalRuler(canvasHorizontalRulerRef)).catch(error => console.error("Canvas horizontal ruler paint failed.", error));
    }, [paintHorizontalRuler, rerenderId, repaintId]);
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        (document.activeElement as HTMLElement)?.blur();
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
    const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
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
    const handleHorizontalRulerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        (document.activeElement as HTMLElement)?.blur();
        e.stopPropagation();
        e.preventDefault();
        const origin = { y: e.clientY };
        const { height } = e.currentTarget.getBoundingClientRect();
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const y = e.clientY;
            setVerticalOffset(verticalOffset + (y - origin.y) / (height * 0.5));
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [setVerticalOffset, verticalOffset]);
    const handleHorizontalRulerWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (!e.deltaY) return;
        e.stopPropagation();
        setVerticalZoom(zoom => zoom * 1.5 ** (e.deltaY < 0 ? 1 : -1));
    }, [setVerticalZoom]);
    const handleHorizontalRulerDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setVerticalZoom(defaultVerticalZoom);
        setVerticalOffset(defaultVerticalOffset);
    }, [defaultVerticalOffset, defaultVerticalZoom, setVerticalOffset, setVerticalZoom]);
    const handleResizeStartMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current || !selRange) return;
        (document.activeElement as HTMLElement)?.blur();
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
        (document.activeElement as HTMLElement)?.blur();
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
    const [selStart, selEnd] = selRange || [0, 0];
    const selLeft = getCssFromPosition(viewRange, selStart);
    const selWidth = getCssFromPosition(viewRange, selStart, selEnd);
    const playheadLeft = getCssFromPosition(viewRange, playhead);
    const cursorXLeft = `${cursorX}px`;
    const cursorYTop = `${cursorY}px`;
    const calculatingError = Array.isArray(calculating) && calculating[0] < 0 ? calculating[1] : null;
    return (<>
        <div className={`visualizer-component-container module-using-canvas-container ${module.moduleId.replace(".", "-")}-container`}>
            <div className="module-using-canvas-background">
                <canvas style={{ opacity: backgroundOpacity ?? 1 }} ref={backgroundCanvasRef} />
            </div>
            <div className="module-using-canvas-vertical-ruler-container">
                <canvas ref={canvasVerticalRulerRef} />
            </div>
            <div className="module-using-canvas-horizontal-ruler-container" onMouseDown={handleHorizontalRulerMouseDown} onWheel={handleHorizontalRulerWheel} onDoubleClick={handleHorizontalRulerDoubleClick}>
                <canvas ref={canvasHorizontalRulerRef} />
            </div>
            <div ref={divMainRef} className="module-using-canvas-canvas-container visualizer-component-visualization-area" onMouseDown={handleCanvasMouseDown} onWheel={handleCanvasWheel}>
                <canvas ref={canvasRef} style={{ opacity: foregroundOpacity ?? 1 }} />
                <div className="selrange" style={{ left: selLeft, width: selWidth }} hidden={!selRange}>
                    <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                    <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                </div>
                {/*
                <div className="fades">
                    {viewStart === 0 ? <div title={this.strings.fadeIn} className="fadein-handler" onMouseDown={this.handleFadeInMouseDown}><Icon name="adjust" inverted size="small" /></div> : undefined}
                    {viewEnd === l ? <div title={this.strings.fadeOut} className="fadeout-handler" onMouseDown={this.handleFadeOutMouseDown}><Icon name="adjust" inverted size="small" /></div> : undefined}
                    {selRange ? <div title={this.strings.gain} className="fade-handler" style={{ left: `${Math.max(10, Math.min(90, $selStart * 100))}%` }}><Icon name="adjust" inverted size="small" /><GainInputUI unit="dB" gain={this.state.fade || 0} onAdjust={this.handleFadeAdjust} onChange={this.handleFadeChange} /></div> : undefined}
                </div>
                */}
            </div>
            {
                monitoring
                ? <div className="cursor-container">
                    {canvasRef.current && typeof cursorX === "number" && 0 <= cursorX && cursorX <= canvasRef.current.width ? <div className="cursor-x" style={{ left: cursorXLeft }} /> : null}
                    {canvasRef.current && typeof cursorY === "number" && 0 <= cursorY && cursorY <= canvasRef.current.height ? <div className="cursor-y" style={{ top: cursorYTop }} /> : null}
                </div>
                : null
            }
            <div className="playhead-container">
                {playhead < viewStart || playhead > viewEnd ? null : <div className="playhead" style={{ left: playheadLeft }} />}
            </div>
            <div className="channel-enable-overlay">
                {showChannelEnableOverlay ? enabledChannels.map((enabled, i) => <div key={i} className={enabled ? "" : "disabled"} />) : null}
            </div>
            {
                calculating
                ? <div className={`calculating-overlay${calculatingError ? " error" : ""}`}>
                    <div>
                        {calculatingError ? null : <VSCodeProgressRing />}
                        <div>
                            {calculatingError ?? (Array.isArray(calculating) ? `${Math.max(0, Math.min(100, Math.round(calculating[0])))}% · Completed: ${calculating[1]}` : "Starting…")}
                        </div>
                    </div>
                </div>
                : null
            }
        </div>
        <div className={`visualizer-component-configuration module-using-canvas-configuration ${module.moduleId.replace(".", "-")}-configuration-container`}>
            {configurationContent}
        </div>
        <div className={`visualizer-component-monitor module-using-canvas-monitor ${module.moduleId.replace(".", "-")}-monitor-container`}>
            {monitorContent}
            <div className="hover-tips">Press L to {cursorLocked ? "unlock" : "lock"} the cursor</div>
        </div>
    </>);
};

export default ModuleUsingCanvas;
