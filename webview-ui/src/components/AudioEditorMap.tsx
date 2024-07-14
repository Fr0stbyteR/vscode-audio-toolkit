import "./AudioEditorMap.scss";
import * as vscode from "vscode";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

interface Props {
}
const AudioEditorMap: FunctionComponent<Props> = () => {
    const audioEditor = useContext(AudioEditorContext)!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const divViewRangeRef = useRef<HTMLDivElement>(null);
    const [cursor, setCursor] = useState(audioEditor.state.cursor);
    const [viewRange, setViewRange] = useState(audioEditor.state.viewRange);
    const [selRange, setSelRange] = useState(audioEditor.state.selRange);
    useEffect(() => {
        audioEditor.on("cursor", setCursor);
        audioEditor.on("viewRange", setViewRange);
        audioEditor.on("selRange", setSelRange);
        audioEditor.on("cursor", paint);
        audioEditor.on("viewRange", paint);
        audioEditor.on("selRange", paint);
        audioEditor.on("uiResized", paint);
        paint();
        return () => {
            audioEditor.off("cursor", setCursor);
            audioEditor.off("viewRange", setViewRange);
            audioEditor.off("selRange", setSelRange);
            audioEditor.off("cursor", paint);
            audioEditor.off("viewRange", paint);
            audioEditor.off("selRange", paint);
            audioEditor.off("uiResized", paint);
        };
    }, []);

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
        audioEditor.waveform.paint(ctx, { width, height, verticalZoom: 1, verticalOffset: 0 }, { cursor, viewRange, selRange });
    }, []);
    const handleMoveMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvasRef.current || !divViewRangeRef.current) return;
        e.stopPropagation();
        e.preventDefault();
        const origin = { x: e.clientX, y: e.clientY };
        const parentRect = canvasRef.current.getBoundingClientRect();
        const rect = divViewRangeRef.current.getBoundingClientRect();
        const curLeft = rect.left - parentRect.left;
        const { length } = audioEditor;
        const viewLength = viewRange[1] - viewRange[0];
        divViewRangeRef.current.style.cursor = "grabbing";
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (divViewRangeRef.current && e.movementX) {
                const x = e.clientX;
                const left = curLeft + (x - origin.x);
                const startSample = Math.max(0, Math.min(length - viewLength, left / parentRect.width * length));
                const endSample = startSample + viewLength;
                audioEditor.setViewRange([startSample, endSample]);
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (divViewRangeRef.current) divViewRangeRef.current.style.cursor = "grab";
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, []);
    const handleResizeStartMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!divViewRangeRef.current) return;
        e.stopPropagation();
        e.preventDefault();
        const origin = { x: e.clientX, y: e.clientY };
        const parent = divViewRangeRef.current.parentElement!;
        const parentRect = parent.getBoundingClientRect();
        const rect = divViewRangeRef.current.getBoundingClientRect();
        const curLeft = rect.left - parentRect.left;
        const curRight = parentRect.right - rect.right;
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (divViewRangeRef.current && e.movementX) {
                const left = Math.max(0, Math.min(parentRect.width - curRight - 10, curLeft + (e.clientX - origin.x)));
                const startSample = left / parentRect.width * audioEditor.length;
                audioEditor.setViewRange([startSample, viewRange[1]]);
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, []);
    const handleResizeEndMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!divViewRangeRef.current) return;
        e.stopPropagation();
        e.preventDefault();
        const origin = { x: e.clientX, y: e.clientY };
        const parent = divViewRangeRef.current.parentElement!;
        const parentRect = parent.getBoundingClientRect();
        const rect = divViewRangeRef.current.getBoundingClientRect();
        const curWidth = rect.width;
        const curLeft = rect.left - parentRect.left;
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (divViewRangeRef.current && e.movementX) {
                const width = Math.max(10, Math.min(parentRect.width - curLeft, curWidth - (origin.x - e.clientX)));
                const length = width / parentRect.width * audioEditor.length;
                audioEditor.setViewRange([viewRange[0], viewRange[0] + length]);
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            audioEditor.scrollH(e.deltaX > 0 ? 0.01 : -0.01);
            return;
        }
        const origin = { x: e.clientX, y: e.clientY };
        const rect = e.currentTarget.getBoundingClientRect();
        const ref = (origin.x - rect.left) / rect.width * audioEditor.length;
        audioEditor.zoomH(ref, e.deltaY < 0 ? 1 : -1);
    }, []);
    const handleClickSelectAll = useCallback(() => audioEditor.setViewRangeToAll(), []);
    const { length } = audioEditor;
    const [viewStart, viewEnd] = viewRange;
    const viewLeft = `${viewStart / length * 100}%`;
    const viewWidth = `${(viewEnd - viewStart) / length * 100}%`;
    const [selStart, selEnd] = selRange || [0, 0];
    const selLeft = `${selStart / length * 100}%`;
    const selWidth = `${(selEnd - selStart) / length * 100}%`;
    return (
        <div className="editor-map">
            <div className="editor-map-canvas-container" onWheel={handleWheel}>
                <canvas ref={canvasRef} />
                <div className="editor-map-selrange" style={{ left: selLeft, width: selWidth }} />
                <div className="editor-map-viewrange" ref={divViewRangeRef} style={{ left: viewLeft, width: viewWidth }} onMouseDown={handleMoveMouseDown}>
                    <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                    <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                </div>
            </div>
            <div className="editor-map-controls">
                <span className="editor-map-select-all" >
                    <VSCodeButton aria-label="View All" appearance="icon" onClick={handleClickSelectAll}>
                        <span className="codicon codicon-check"></span>
                    </VSCodeButton>
                </span>
            </div>
        </div>
    );
};

export default AudioEditorMap;
