import "./AudioEditorMap.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { AudioEditorState } from "../core/AudioEditor";
import { getCssFromPosition, setCanvasToFullSize } from "../utils";
import { VisualizationStyleOptions } from "../core/AudioToolkitModule";
import Waveform from "../modules/waveform/Waveform";
import VectorImageProcessor from "../core/VectorImageProcessor";
import { useLocale } from "../i18n/LocaleContext";

interface Props extends Pick<AudioEditorState, "playhead" | "selRange" | "viewRange">, Partial<VisualizationStyleOptions> {
    windowSize: number[];
    configuring: boolean,
    monitoring: boolean,
    setConfiguring: React.Dispatch<React.SetStateAction<boolean>>;
    configurationMode: "analysis" | "appearance" | "both";
    setConfigurationMode: React.Dispatch<React.SetStateAction<"analysis" | "appearance" | "both">>;
    setMonitoring: React.Dispatch<React.SetStateAction<boolean>>;
    overlayMode: boolean;
    setOverlayMode: React.Dispatch<React.SetStateAction<boolean>>;
    layersOpen: boolean;
    setLayersOpen: React.Dispatch<React.SetStateAction<boolean>>;
    standalone?: boolean;
}
const AudioEditorMap: FunctionComponent<Props> = ({ playhead, viewRange, selRange, phosphorColor, playheadColor, windowSize, configuring, monitoring, setConfiguring, configurationMode, setConfigurationMode, setMonitoring, overlayMode, setOverlayMode, layersOpen, setLayersOpen, standalone }) => {
    const { locale, setLocale, t } = useLocale();
    const audioEditor = useContext(AudioEditorContext)!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const divViewRangeRef = useRef<HTMLDivElement>(null);
    const module = audioEditor.modulesInstance[0] as Waveform;
    const [dataSlices, setDataSlices] = useState<typeof module.dataSlices>(module.dataSlices);
    const [layoutRevision, setLayoutRevision] = useState(0);
    const handleDataChange = useCallback((dataSlices: typeof module.dataSlices) => setDataSlices(dataSlices), [module]);
    useEffect(() => {
        module.onDataChange = handleDataChange;
        return () => module.onDataChange = undefined;
    }, [handleDataChange, module]);
    useEffect(() => {
        const element = canvasRef.current?.parentElement;
        if (!element || typeof ResizeObserver === "undefined") return;
        let frame = 0;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => setLayoutRevision(value => value + 1));
        });
        observer.observe(element);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, []);
    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        if (!dataSlices?.length) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paint(ctx, dataSlices, { width, height, verticalZoom: 1, verticalOffset: 0 }, { viewRange: [0, audioEditor.length] }, { phosphorColor });
    }, [dataSlices, audioEditor, phosphorColor]);
    useEffect(paint, [layoutRevision, paint, windowSize, phosphorColor, playheadColor]);
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
    const handleWheel = useCallback((e: WheelEvent) => {
        if (!e.deltaX && !e.deltaY) return;
        e.preventDefault();
        e.stopPropagation();
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            audioEditor.scrollH(e.deltaX > 0 ? 0.01 : -0.01);
            return;
        }
        const origin = { x: e.clientX, y: e.clientY };
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const ref = (origin.x - rect.left) / rect.width * audioEditor.length;
        audioEditor.zoomH(ref, e.deltaY < 0 ? 1 : -1);
    }, [audioEditor]);
    useEffect(() => {
        const element = canvasRef.current?.parentElement;
        if (!element) return;
        element.addEventListener("wheel", handleWheel, { passive: false });
        return () => element.removeEventListener("wheel", handleWheel);
    }, [handleWheel]);
    const handleClickSelectAll = useCallback(() => audioEditor.setViewRangeToAll(), [audioEditor]);
    const toggleConfiguration = (kind: "analysis" | "appearance") => {
        if (!configuring) { setConfigurationMode(kind); setConfiguring(true); return; }
        if (configurationMode === "both") { setConfigurationMode(kind === "analysis" ? "appearance" : "analysis"); return; }
        if (configurationMode === kind) { setConfiguring(false); return; }
        setConfigurationMode("both");
    };
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
        <div className={`editor-map${!standalone && configuring ? " configuring" : ""}${!standalone && monitoring ? " monitoring" : ""}`}>
            <div className="editor-map-canvas-container">
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
                    <VSCodeButton tabIndex={-1} aria-label={t("View All")} title={t("View All")} appearance="icon" onClick={handleClickSelectAll}>
                        <span className="codicon codicon-symbol-array"></span>
                    </VSCodeButton>
                </span>
                {!standalone ? <span className="editor-map-toggle-configuration">
                    <VSCodeButton tabIndex={-1} aria-label={t("Analysis settings")} className={configuring && configurationMode !== "appearance" ? "active" : ""} title={t("Analysis settings (requires recalculation)")} appearance="icon" onClick={() => toggleConfiguration("analysis")}>
                        <span className="codicon codicon-beaker"></span>
                    </VSCodeButton>
                </span> : null}
                {!standalone ? <span className="editor-map-toggle-configuration">
                    <VSCodeButton tabIndex={-1} aria-label={t("Appearance settings")} className={configuring && configurationMode !== "analysis" ? "active" : ""} title={t("Appearance settings (instant)")} appearance="icon" onClick={() => toggleConfiguration("appearance")}>
                        <span className="codicon codicon-paintcan"></span>
                    </VSCodeButton>
                </span> : null}
                {!standalone ? <span className="editor-map-toggle-monitoring">
                    <VSCodeButton tabIndex={-1} aria-label={t("Toggle Data Monitoring")} className={monitoring ? "active" : ""} title={t("Toggle Data Monitoring")} appearance="icon" onClick={() => setMonitoring(v => !v)}>
                        <span className="codicon codicon-info"></span>
                    </VSCodeButton>
                </span> : null}
                {!standalone ? <span>
                    <VSCodeButton tabIndex={-1} aria-label={t("Overlay modules")} className={overlayMode ? "active" : ""} title={t("Overlay modules")} appearance="icon" onClick={() => setOverlayMode(v => !v)}>
                        <span className="codicon codicon-layers"></span>
                    </VSCodeButton>
                </span> : null}
                {!standalone ? <span>
                    <VSCodeButton tabIndex={-1} aria-label={t("Layers")} className={layersOpen ? "active" : ""} title={t("Layers")} appearance="icon" onClick={() => setLayersOpen(v => !v)}>
                        <span className="codicon codicon-list-tree"></span>
                    </VSCodeButton>
                </span> : null}
                {!standalone ? <span className="editor-map-locale"><VSCodeButton tabIndex={-1} appearance="icon" aria-label={locale === "zh" ? "Switch to English" : "切换到中文"} title={locale === "zh" ? "Switch to English" : "切换到中文"} onClick={() => setLocale(locale === "zh" ? "en" : "zh")}>{locale === "zh" ? "EN" : "中"}</VSCodeButton></span> : null}
            </div>
        </div>
    );
};

export default AudioEditorMap;
