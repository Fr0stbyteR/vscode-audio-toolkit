import "./AudioEditorMap.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { AudioEditorState } from "../core/AudioEditor";
import { getCssFromPosition, setCanvasToFullSize } from "../utils";
import { VisualizationStyleOptions } from "../core/AudioToolkitModule";
import Waveform from "../modules/waveform/Waveform";
import VectorImageProcessor from "../core/VectorImageProcessor";

interface Props extends Pick<AudioEditorState, "playhead" | "selRange" | "viewRange">, Partial<VisualizationStyleOptions> {
    windowSize: number[];
    configuring: boolean,
    monitoring: boolean,
    setConfiguring: React.Dispatch<React.SetStateAction<boolean>>;
    configurationMode: "analysis" | "appearance";
    setConfigurationMode: React.Dispatch<React.SetStateAction<"analysis" | "appearance">>;
    setMonitoring: React.Dispatch<React.SetStateAction<boolean>>;
    overlayMode: boolean;
    setOverlayMode: React.Dispatch<React.SetStateAction<boolean>>;
    layersOpen: boolean;
    setLayersOpen: React.Dispatch<React.SetStateAction<boolean>>;
}
const AudioEditorMap: FunctionComponent<Props> = ({ playhead, viewRange, selRange, phosphorColor, playheadColor, windowSize, configuring, monitoring, setConfiguring, configurationMode, setConfigurationMode, setMonitoring, overlayMode, setOverlayMode, layersOpen, setLayersOpen }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const divViewRangeRef = useRef<HTMLDivElement>(null);
    const module = audioEditor.modulesInstance[0] as Waveform;
    const [dataSlices, setDataSlices] = useState<typeof module.dataSlices>(module.dataSlices);
    const handleDataChange = useCallback((dataSlices: typeof module.dataSlices) => setDataSlices(dataSlices), [module]);
    useEffect(() => {
        module.onDataChange = handleDataChange;
        return () => module.onDataChange = undefined;
    }, [handleDataChange, module]);
    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        if (!dataSlices?.length) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paint(ctx, dataSlices, { width, height, verticalZoom: 1, verticalOffset: 0 }, { viewRange: [0, audioEditor.length] }, { phosphorColor });
    }, [dataSlices, audioEditor, phosphorColor]);
    useEffect(paint, [paint, windowSize, phosphorColor, playheadColor]);
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
        divViewRangeRef.current.classList.add("active");
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
            if (divViewRangeRef.current) {
                divViewRangeRef.current.style.cursor = "grab";
                divViewRangeRef.current.classList.remove("active");
            }
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [audioEditor, viewRange]);
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
    }, [audioEditor, viewRange]);
    const handleResizeEndMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
    }, [audioEditor, viewRange]);
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (!e.deltaX && !e.deltaY) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            audioEditor.scrollH(e.deltaX > 0 ? 0.01 : -0.01);
            return;
        }
        const origin = { x: e.clientX, y: e.clientY };
        const rect = e.currentTarget.getBoundingClientRect();
        const ref = (origin.x - rect.left) / rect.width * audioEditor.length;
        audioEditor.zoomH(ref, e.deltaY < 0 ? 1 : -1);
    }, [audioEditor]);
    const handleClickSelectAll = useCallback(() => audioEditor.setViewRangeToAll(), [audioEditor]);
    const { length } = audioEditor;
    const range: [number, number] = [0, length];
    const [viewStart, viewEnd] = viewRange;
    const viewLeft = `${viewStart / length * 100}%`;
    const viewWidth = `calc(${(viewEnd - viewStart) / length * 100}% - 2px)`;
    const [selStart, selEnd] = selRange || [0, 0];
    const selLeft = getCssFromPosition(range, selStart);
    const selWidth = getCssFromPosition(range, selStart, selEnd);
    const playheadLeft = getCssFromPosition(range, playhead);
    return (
        <div className={`editor-map${configuring ? " configuring" : ""}${monitoring ? " monitoring" : ""}`}>
            <div className="editor-map-canvas-container" onWheel={handleWheel}>
                <canvas ref={canvasRef} />
                <div className="editor-map-playhead" style={{ left: playheadLeft }}></div>
                <div className="editor-map-selrange" style={{ left: selLeft, width: selWidth }} />
                <div className="editor-map-viewrange" ref={divViewRangeRef} style={{ left: viewLeft, width: viewWidth }} onMouseDown={handleMoveMouseDown}>
                    <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                    <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                </div>
            </div>
            <div className="editor-map-controls">
                <span className="editor-map-select-all">
                    <VSCodeButton tabIndex={-1} aria-label="View All" title="View All" appearance="icon" onClick={handleClickSelectAll}>
                        <span className="codicon codicon-symbol-array"></span>
                    </VSCodeButton>
                </span>
                <span className="editor-map-toggle-configuration">
                    <VSCodeButton tabIndex={-1} aria-label="Analysis settings" className={configuring && configurationMode === "analysis" ? "active" : ""} title="Analysis settings (requires recalculation)" appearance="icon" onClick={() => { setConfigurationMode("analysis"); setConfiguring(v => configurationMode === "analysis" ? !v : true); }}>
                        <span className="codicon codicon-beaker"></span>
                    </VSCodeButton>
                </span>
                <span className="editor-map-toggle-configuration">
                    <VSCodeButton tabIndex={-1} aria-label="Appearance settings" className={configuring && configurationMode === "appearance" ? "active" : ""} title="Appearance settings (instant)" appearance="icon" onClick={() => { setConfigurationMode("appearance"); setConfiguring(v => configurationMode === "appearance" ? !v : true); }}>
                        <span className="codicon codicon-paintcan"></span>
                    </VSCodeButton>
                </span>
                <span className="editor-map-toggle-monitoring">
                    <VSCodeButton tabIndex={-1} aria-label="Toggle Data Monitoring" className={monitoring ? "active" : ""} title="Toggle Data Monitoring" appearance="icon" onClick={() => setMonitoring(v => !v)}>
                        <span className="codicon codicon-info"></span>
                    </VSCodeButton>
                </span>
                <span>
                    <VSCodeButton tabIndex={-1} aria-label="Overlay modules" className={overlayMode ? "active" : ""} title="Overlay modules" appearance="icon" onClick={() => setOverlayMode(v => !v)}>
                        <span className="codicon codicon-layers"></span>
                    </VSCodeButton>
                </span>
                <span>
                    <VSCodeButton tabIndex={-1} aria-label="Layers" className={layersOpen ? "active" : ""} title="Layers" appearance="icon" onClick={() => setLayersOpen(v => !v)}>
                        <span className="codicon codicon-list-tree"></span>
                    </VSCodeButton>
                </span>
            </div>
        </div>
    );
};

export default AudioEditorMap;
