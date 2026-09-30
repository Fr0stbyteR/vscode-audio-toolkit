import "./ModuleUsingCanvas.scss";
import { useLocale } from "../i18n/LocaleContext";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { AudioToolkitModule, VisualizationOptions } from "../core/AudioToolkitModule";
import AudioEditor from "../core/AudioEditor";
import VectorImageProcessor, { VectorDataSlice } from "../core/VectorImageProcessor";
import MatrixImageProcessor, { MatrixDataSlice } from "../core/MatrixImageProcessor";
import Waveform from "../modules/waveform/Waveform";
import Spectrogram from "../modules/spectrogram/Spectrogram";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { getCssFromPosition, setCanvasToFullSize } from "../utils";
import { createPortal } from "react-dom";

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
    onCanvasMouseDown?: (event: React.MouseEvent<HTMLDivElement>, rect: DOMRect) => boolean;
}

const referenceSpectrograms = new WeakMap<AudioEditor, Promise<Spectrogram>>();

const ModuleUsingCanvas: FunctionComponent<ModuleUsingCanvasProps> = (props) => {
    const { t } = useLocale();
    const {
        module, moduleState, calculating,
        paint, paintBackground, paintVerticalRuler, paintHorizontalRuler,
        defaultVerticalZoom, verticalZoom, setVerticalZoom,
        defaultVerticalOffset, verticalOffset, setVerticalOffset,
        cursorX, cursorY, onCursor,
        showChannelEnableOverlay, backgroundOpacity, foregroundOpacity,
        configurationContent, monitorContent,
        viewRange, enabledChannels, selRange,
        configuring, monitoring, overlayMode, activeLayer, rerenderId, repaintId, onCanvasMouseDown
    } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const referenceCanvasRef = useRef<HTMLCanvasElement>(null);
    const referencePaintRevision = useRef(0);
    const [referenceData, setReferenceData] = useState<{ kind: "waveform" | "spectrogram"; slices: VectorDataSlice[] | MatrixDataSlice[] }>();
    const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const canvasHorizontalRulerRef = useRef<HTMLCanvasElement>(null);
    const horizontalRulerRef = useRef<HTMLDivElement>(null);
    const divMainRef = useRef<HTMLDivElement>(null);
    const [cursorLocked, setCursorLocked] = useState(false);
    const [cursorHovered, setCursorHovered] = useState(false);
    const [layoutRevision, setLayoutRevision] = useState(0);
    const handleWindowKeyDown = useCallback((e: KeyboardEvent) => {
        if (!monitoring || !activeLayer || e.key.toLowerCase() !== "l" || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
        const target = e.target as HTMLElement | null;
        if (target?.isContentEditable || target?.closest("input, textarea, select, vscode-text-field, vscode-dropdown")) return;
        setCursorLocked(locked => !locked);
    }, [activeLayer, monitoring]);
    const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        setCursorHovered(true);
        if (!canvasRef.current || !onCursor || !monitoring || cursorLocked) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.x;
        const y = e.clientY - rect.y;
        onCursor(x, y, ~~rect.width, ~~rect.height);
    }, [onCursor, monitoring, cursorLocked]);
    const handleCanvasMouseLeave = useCallback(() => {
        setCursorHovered(false);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect && onCursor && !cursorLocked) onCursor(-1, -1, ~~rect.width, ~~rect.height);
    }, [onCursor, cursorLocked]);
    useEffect(() => {
        window.addEventListener("keydown", handleWindowKeyDown);
        return () => window.removeEventListener("keydown", handleWindowKeyDown);
    }, [handleWindowKeyDown]);
    useEffect(() => {
        const scrollContainer = divMainRef.current?.closest(".editor-main");
        if (!scrollContainer) return;
        const hideCursor = () => setCursorHovered(false);
        scrollContainer.addEventListener("scroll", hideCursor, { passive: true });
        return () => scrollContainer.removeEventListener("scroll", hideCursor);
    }, []);
    useEffect(() => {
        const element = divMainRef.current;
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
    useEffect(() => {
        const rect = divMainRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        void Promise.resolve().then(() => paint(canvasRef)).catch(error => console.error("Canvas paint failed.", error));
    }, [layoutRevision, paint, rerenderId, repaintId]);
    useEffect(() => {
        let cancelled = false;
        const kind = overlayMode ? "none" : moduleState.referenceOverlay ?? "none";
        setReferenceData(undefined);
        if (kind === "none" || kind === module.moduleId) return;
        const load = async () => {
            if (kind === "waveform") {
                const waveform = audioEditor.modulesInstance.find(instance => instance.moduleId === Waveform.MODULE_ID) as Waveform | undefined;
                if (!waveform) return;
                const slices = waveform.dataSlices ?? (await waveform.sharableData)?.dataSlices;
                if (!cancelled && slices?.length) setReferenceData({ kind, slices });
            } else {
                let spectrogram = audioEditor.modulesInstance.find(instance => instance.moduleId === Spectrogram.MODULE_ID) as Spectrogram | undefined;
                if (!spectrogram) {
                    let pending = referenceSpectrograms.get(audioEditor);
                    if (!pending) {
                        pending = Spectrogram.fromAudioData(audioEditor);
                        referenceSpectrograms.set(audioEditor, pending);
                    }
                    spectrogram = await pending;
                }
                const slices = spectrogram.dataSlices ?? (await spectrogram.sharableData)?.dataSlices;
                if (!cancelled && slices?.length) setReferenceData({ kind, slices });
            }
        };
        void load().catch(error => console.error("Reference overlay failed.", error));
        return () => { cancelled = true; };
    }, [audioEditor, module.moduleId, moduleState.referenceOverlay, overlayMode]);
    useEffect(() => {
        const canvas = referenceCanvasRef.current;
        const rect = divMainRef.current?.getBoundingClientRect();
        if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const revision = ++referencePaintRevision.current;
        const [width, height] = setCanvasToFullSize(canvas);
        ctx.clearRect(0, 0, width, height);
        if (overlayMode || !referenceData) return;
        if (referenceData.kind === "waveform") {
            VectorImageProcessor.paint(ctx, referenceData.slices as VectorDataSlice[], { width, height, paintSeparator: false }, { viewRange }, { phosphorColor: "#78d8ff" });
        } else {
            const buffer = document.createElement("canvas");
            buffer.width = width;
            buffer.height = height;
            const bufferContext = buffer.getContext("2d");
            if (!bufferContext) return;
            void MatrixImageProcessor.paint(bufferContext, referenceData.slices as MatrixDataSlice[], { width, height, minValue: -90, maxValue: -5 }, { viewRange }, {}).then(() => {
                if (revision !== referencePaintRevision.current) return;
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(buffer, 0, 0);
            }).catch(error => console.error("Reference spectrogram paint failed.", error));
        }
    }, [layoutRevision, overlayMode, referenceData, rerenderId, viewRange]);
    useEffect(() => {
        const rect = divMainRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        if (paintBackground) void Promise.resolve().then(() => paintBackground(backgroundCanvasRef)).catch(error => console.error("Canvas background paint failed.", error));
    }, [layoutRevision, paintBackground, rerenderId, repaintId]);
    useEffect(() => {
        const rect = divMainRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        void Promise.resolve().then(() => paintVerticalRuler(canvasVerticalRulerRef)).catch(error => console.error("Canvas vertical ruler paint failed.", error));
    }, [layoutRevision, paintVerticalRuler, rerenderId, repaintId]);
    useEffect(() => {
        const rect = divMainRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        void Promise.resolve().then(() => paintHorizontalRuler(canvasHorizontalRulerRef)).catch(error => console.error("Canvas horizontal ruler paint failed.", error));
    }, [layoutRevision, paintHorizontalRuler, rerenderId, repaintId]);
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        (document.activeElement as HTMLElement)?.blur();
        e.stopPropagation();
        e.preventDefault();
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const origin = { x: e.clientX, y: e.clientY };
        const rect = e.currentTarget.getBoundingClientRect();
        if (onCanvasMouseDown?.(e, rect)) return;
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
    }, [audioEditor, onCanvasMouseDown, viewRange]);
    const handleCanvasWheel = useCallback((e: WheelEvent) => {
        if (!e.deltaX && !e.deltaY) return;
        e.preventDefault();
        e.stopPropagation();
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            audioEditor.scrollH(e.deltaX > 0 ? 0.01 : -0.01);
            return;
        }
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const origin = { x: e.clientX, y: e.clientY };
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const ref = viewStart + (origin.x - rect.left) / rect.width * viewLength;
        audioEditor.zoomH(ref, e.deltaY < 0 ? 1 : -1);
    }, [audioEditor, viewRange]);
    useEffect(() => {
        const element = divMainRef.current;
        if (!element) return;
        element.addEventListener("wheel", handleCanvasWheel, { passive: false });
        return () => element.removeEventListener("wheel", handleCanvasWheel);
    }, [handleCanvasWheel]);
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
    const handleHorizontalRulerWheel = useCallback((e: WheelEvent) => {
        if (!e.deltaY) return;
        e.preventDefault();
        e.stopPropagation();
        setVerticalZoom(zoom => zoom * 1.5 ** (e.deltaY < 0 ? 1 : -1));
    }, [setVerticalZoom]);
    useEffect(() => {
        const element = horizontalRulerRef.current;
        if (!element) return;
        element.addEventListener("wheel", handleHorizontalRulerWheel, { passive: false });
        return () => element.removeEventListener("wheel", handleHorizontalRulerWheel);
    }, [handleHorizontalRulerWheel]);
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
    const [selStart, selEnd] = selRange || [0, 0];
    const selLeft = getCssFromPosition(viewRange, selStart);
    const selWidth = getCssFromPosition(viewRange, selStart, selEnd);
    const cursorXLeft = `${cursorX}px`;
    const cursorYTop = `${cursorY}px`;
    const calculatingError = Array.isArray(calculating) && calculating[0] < 0 ? calculating[1] : null;
    const inspectorConfigRoot = document.getElementById("inspector-config-root");
    const inspectorAppearance = document.getElementById("inspector-appearance");
    const inspectorData = document.getElementById("inspector-data");
    const referenceControls = <div className="canvas-reference-controls">
        <label>{t("Reference layer")}<select value={moduleState.referenceOverlay ?? "none"} onChange={event => module.setState({ ...moduleState, referenceOverlay: event.target.value as "none" | "waveform" | "spectrogram" })}>
            <option value="none">{t("None")}</option>
            {module.moduleId !== "waveform" ? <option value="waveform">{t("Waveform")}</option> : null}
            {module.moduleId !== "spectrogram" ? <option value="spectrogram">{t("Spectrogram")}</option> : null}
        </select></label>
        {moduleState.referenceOverlay && moduleState.referenceOverlay !== "none" ? <label>{t("Reference opacity")} <output>{Math.round((moduleState.referenceOpacity ?? .35) * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={moduleState.referenceOpacity ?? .35} onChange={event => module.setState({ ...moduleState, referenceOpacity: Number(event.target.value) })} /></label> : null}
    </div>;
    return (<>
        <div className={`visualizer-component-container module-using-canvas-container ${module.moduleId.replace(".", "-")}-container`}>
            <div className="module-using-canvas-background">
                <canvas style={{ opacity: backgroundOpacity ?? 1 }} ref={backgroundCanvasRef} />
            </div>
            <div className="module-using-canvas-vertical-ruler-container">
                <canvas ref={canvasVerticalRulerRef} />
            </div>
            <div ref={horizontalRulerRef} className="module-using-canvas-horizontal-ruler-container" onMouseDown={handleHorizontalRulerMouseDown} onDoubleClick={handleHorizontalRulerDoubleClick}>
                <canvas ref={canvasHorizontalRulerRef} />
            </div>
            <div ref={divMainRef} className="module-using-canvas-canvas-container visualizer-component-visualization-area" onMouseDown={handleCanvasMouseDown} onMouseEnter={() => setCursorHovered(true)} onMouseMove={handleCanvasMouseMove} onMouseLeave={handleCanvasMouseLeave}>
                <canvas ref={canvasRef} style={{ opacity: foregroundOpacity ?? 1 }} />
                <canvas ref={referenceCanvasRef} className="canvas-reference-overlay" style={{ opacity: moduleState.referenceOpacity ?? .35, display: overlayMode || !moduleState.referenceOverlay || moduleState.referenceOverlay === "none" ? "none" : undefined }} />
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
                monitoring && cursorHovered && (!overlayMode || activeLayer)
                ? <div className="cursor-container">
                    {canvasRef.current && typeof cursorX === "number" && 0 <= cursorX && cursorX <= canvasRef.current.width ? <div className="cursor-x" style={{ left: cursorXLeft }} /> : null}
                    {canvasRef.current && typeof cursorY === "number" && 0 <= cursorY && cursorY <= canvasRef.current.height ? <div className="cursor-y" style={{ top: cursorYTop }} /> : null}
                </div>
                : null
            }
            <div className="channel-enable-overlay">
                {showChannelEnableOverlay ? enabledChannels.map((enabled, i) => <div key={i} className={enabled ? "" : "disabled"} />) : null}
            </div>
            {
                calculating
                ? <div className={`calculating-overlay${calculatingError ? " error" : ""}`}>
                    <div>
                        {calculatingError ? null : <VSCodeProgressRing />}
                        <div>
                            {calculatingError ?? (Array.isArray(calculating) ? `${Math.max(0, Math.min(100, Math.round(calculating[0])))}% · ${t("Completed:")} ${calculating[1]}` : t("Starting…"))}
                        </div>
                    </div>
                </div>
                : null
            }
        </div>
        {inspectorConfigRoot ? (activeLayer && configurationContent ? createPortal(configurationContent, inspectorConfigRoot) : null) :
            <div className={`visualizer-component-configuration module-using-canvas-configuration ${module.moduleId.replace(".", "-")}-configuration-container`}>{configurationContent}</div>}
        {inspectorAppearance && activeLayer && !overlayMode ? createPortal(referenceControls, inspectorAppearance) : null}
        {inspectorData ? (activeLayer ? createPortal(<>{monitorContent}{monitoring ? <div className="data-cursor-tip">{t(cursorLocked ? "Press L to unlock the cursor" : "Press L to lock the cursor")}</div> : null}</>, inspectorData) : null) :
            <div className={`visualizer-component-monitor module-using-canvas-monitor ${module.moduleId.replace(".", "-")}-monitor-container`}>
                {monitorContent}
                <div className="hover-tips">{t(cursorLocked ? "Press L to unlock the cursor" : "Press L to lock the cursor")}</div>
            </div>}
    </>);
};

export default ModuleUsingCanvas;
