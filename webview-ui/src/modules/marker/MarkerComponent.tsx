import "./MarkerComponent.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef } from "react";
import { AudioEditorContext } from "../../components/contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Marker from "./Marker";

const MarkerComponent: FunctionComponent<VisualizationOptions<Marker>> = ({ module, viewRange, selRange, playhead, enabledChannels, phosphorColor, playheadColor, gridColor, gridRulerColor, textColor, monospaceFont, configuration, rerenderTimestamp }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const canvasHorizontalRulerRef = useRef<HTMLCanvasElement>(null);
    const divMainRef = useRef<HTMLDivElement>(null);
    const paintVerticalRuler = useCallback(() => {
        const canvas = canvasVerticalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        module.paintVerticalRuler(ctx, { width, height, gridLabels: false }, { viewRange, configuration }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [module, viewRange, configuration, gridColor, gridRulerColor, textColor, monospaceFont]);
    useEffect(paintVerticalRuler, [paintVerticalRuler, rerenderTimestamp]);
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
    return (<>
        <div className="visualizer-component-container marker-container">
            <div className="marker-background" />
            <div className="marker-horizontal-ruler-container">
                <canvas ref={canvasHorizontalRulerRef} />
            </div>
            <div ref={divMainRef} className="marker-canvas-container visualizer-component-visualization-area" onMouseDown={handleCanvasMouseDown} onWheel={handleWheel}>
                <canvas ref={canvasRef} />
                <div className="selrange" style={{ left: selLeft, width: selWidth }} hidden={!selRange}>
                    <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                    <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                </div>
            </div>
            <div className="playhead-container">
                {$playhead > 1 || $playhead < 0 ? null : <div className="playhead" style={{ left: playheadLeft }} />}
            </div>
        </div>
        <div className="visualizer-component-configuration">
        </div>
    </>);
};

export default MarkerComponent;
