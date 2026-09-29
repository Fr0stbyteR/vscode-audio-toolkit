import "./AudioEditorMain.scss";
import "./AudioEditorComponentContainer.scss";
import { Fragment, FunctionComponent, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { AudioEditorContext } from "./contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { createPortal } from "react-dom";
import { VisualizationStyleOptions, AudioToolkitModulesState } from "../core/AudioToolkitModule";
import { getCssFromPosition, getRuler, setCanvasToFullSize } from "../utils";
import ModuleErrorBoundary from "./ModuleErrorBoundary";
import AnnotationTimeline from "../annotations/AnnotationTimeline";
import { AnnotationContext } from "../annotations/AnnotationContext";
import { useLocale } from "../i18n/LocaleContext";

interface Props extends Pick<AudioEditorState, "playhead" | "selRange" | "viewRange" | "enabledChannels">, VisualizationStyleOptions {
    configuration: AudioEditorConfiguration;
    windowSize: number[];
    configuring: boolean;
    configurationMode: "analysis" | "appearance" | "both";
    monitoring: boolean;
    visualizersState: AudioToolkitModulesState;
    overlayMode: boolean;
    setOverlayMode: React.Dispatch<React.SetStateAction<boolean>>;
    layersOpen: boolean;
    setLayersOpen: React.Dispatch<React.SetStateAction<boolean>>;
    activeLayerIndex: number;
    setActiveLayerIndex: React.Dispatch<React.SetStateAction<number>>;
}

const AudioEditorMain: FunctionComponent<Props> = (props) => {
    const { t } = useLocale();
    const { playhead, viewRange, selRange, windowSize, gridRulerColor, textColor, labelFont, configuration: { audioUnit, beatsPerMeasure, beatsPerMinute, division }, configuring, monitoring, visualizersState, overlayMode, setOverlayMode, layersOpen, setLayersOpen, activeLayerIndex, setActiveLayerIndex } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const annotationSession = useContext(AnnotationContext);
    const divSelRangeRef = useRef<HTMLDivElement>(null);
    const divVerticalRulerRef = useRef<HTMLDivElement>(null);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const [rerenderId, setRerenderId] = useState(performance.now());
    const [draggedLayerIndex, setDraggedLayerIndex] = useState<number | null>(null);
    const handlePlayheadHandlerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!divVerticalRulerRef.current) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = divVerticalRulerRef.current.getBoundingClientRect();
        const { currentTarget, shiftKey } = e;
        if (currentTarget.classList.contains("editor-main-vertical-ruler-area")) {
            const [viewStart, viewEnd] = viewRange;
            const viewLength = viewEnd - viewStart;
            const to = viewStart + (e.clientX - rect.left) / rect.width * viewLength;
            if (shiftKey) audioEditor.setSelRange([playhead, to]);
            else audioEditor.setPlayhead(to);
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
            const to = viewStart + (x - rect.left) / rect.width * viewLength;
            if (shiftKey) audioEditor.setSelRange([playhead, to]);
            else audioEditor.setPlayhead(to);
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
    }, [audioEditor, playhead, viewRange]);
    const handlePlayheadHandlerDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        audioEditor.setSelRange(null);
    }, [audioEditor]);
    const handleSelRangeMoveMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!divVerticalRulerRef.current || !divSelRangeRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const origin = { x: e.clientX, y: e.clientY };
        const parentRect = divVerticalRulerRef.current.getBoundingClientRect();
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
    }, [audioEditor, selRange, viewRange]);
    const handleResizeStartMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!divVerticalRulerRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = divVerticalRulerRef.current.getBoundingClientRect();
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
    }, [audioEditor, selRange, viewRange]);
    const handleResizeEndMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!divVerticalRulerRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = divVerticalRulerRef.current.getBoundingClientRect();
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
    }, [audioEditor, selRange, viewRange]);
    const handleDividerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, visualizerIndex: number) => {
        e.stopPropagation();
        e.preventDefault();
        const divider = e.currentTarget;
        divider.classList.add("active");
        const container = e.currentTarget.previousElementSibling! as HTMLDivElement;
        const origin = { x: e.clientX, y: e.clientY };
        const rect = container.getBoundingClientRect();
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (e.movementY) {
                const y = e.clientY;
                const height = rect.height + (y - origin.y);
                container.style.flex = `0 0 ${height}px`;
                audioEditor.setModuleVisible(visualizerIndex, height);
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            divider.classList.remove("active");
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [audioEditor]);
    const handleClickCollapseVisualizer = useCallback((visualizerIndex: number) => {
        const visible = visualizersState[visualizerIndex].visible;
        audioEditor.setModuleVisible(visualizerIndex, !visible);
    }, [audioEditor, visualizersState]);
    const handleMouseDownMoveVisualizer = useCallback((e: React.MouseEvent<HTMLElement>, visualizerIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        const { currentTarget } = e;
        const container = currentTarget.parentElement!.parentElement!;
        const parent = container.parentElement!;
        const parentRect = parent.getBoundingClientRect();
        const originalHeight = container.style.height;
        container.style.width = "100%";
        container.style.height = `${container.clientHeight}px`;
        container.style.left = `${e.clientX - parentRect.y}px`;
        container.style.top = `${e.clientY - parentRect.x}px`;
        container.classList.add("dragging");
        parent.style.cursor = "grabbing";
        const dividers = [...parent.getElementsByClassName("editor-main-divider")];
        dividers.splice(visualizerIndex, 1);
        let moveToIndex = visualizerIndex;
        dividers[visualizerIndex - 1].classList.add("active");
        setRerenderId(performance.now());
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!e.movementY) return;
            const dividersY = dividers.map(d => d.getBoundingClientRect().y);
            let prevY: number;
            let y: number;;
            let nextY: number;
            for (let i = 0; i < dividers.length; i++) {
                y = dividersY[i];
                prevY = dividersY[i - 1] ?? 0;
                nextY = dividersY[i + 1] ?? Infinity;
                if (e.clientY >= y - (y - prevY) * 0.5 && e.clientY < y + (nextY - y) * 0.5) {
                    moveToIndex = i + 1;
                    dividers[i].classList.add("active");
                } else {
                    dividers[i].classList.remove("active");
                }
            }
            container.style.left = `${e.clientX - parentRect.y}px`;
            container.style.top = `${e.clientY - parentRect.x}px`;
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            dividers.forEach(d => d.classList.remove("active"));
            container.style.width = "initial";
            container.style.height = originalHeight;
            container.style.left = "initial";
            container.style.top = "initial";
            container.classList.remove("dragging");
            parent.style.cursor = "";
            if (visualizerIndex !== moveToIndex) {
                audioEditor.moveModule(visualizerIndex, moveToIndex);
            }
            setRerenderId(performance.now());
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [audioEditor]);
    const handleClickRemoveVisualizer = useCallback((visualizerIndex: number) => {
        audioEditor.removeModule(visualizerIndex);
    }, [audioEditor]);
    const paintVerticalRuler = useCallback(() => {
        const canvas = canvasVerticalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        const { sampleRate } = audioEditor;
        const { ruler } = getRuler(viewRange, audioUnit, { sampleRate, beatsPerMeasure, beatsPerMinute, division });
        const [$drawFrom, $drawTo] = viewRange;
        const pixelsPerSample = width / ($drawTo - $drawFrom);
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = gridRulerColor;
        ctx.fillStyle = textColor;
        ctx.font = `12px ${labelFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(audioUnit === "time" ? "hms" : audioUnit === "measure" ? `${beatsPerMinute} bpm` : "samps", 2, height - 14);
        ctx.textAlign = "center";
        ctx.beginPath();
        let text: string;
        let x: number;
        let y: number;
        for (const $str in ruler) {
            text = ruler[$str];
            x = (+$str - $drawFrom) * pixelsPerSample;
            y = text ? height - 10 : height - 5;
            ctx.moveTo(x, y);
            ctx.lineTo(x, height);
            if (text) ctx.fillText(text, x, y - 4);
        }
        ctx.stroke();
    }, [audioEditor, audioUnit, beatsPerMeasure, beatsPerMinute, division, gridRulerColor, labelFont, textColor, viewRange]);
    const handleStopPropagation = (e: React.KeyboardEvent) => {
        e.stopPropagation();
    };
    useEffect(() => setRerenderId(performance.now()), [windowSize, visualizersState]);
    // useEffect(() => void vscode.setState(visualizersState), [visualizersState]);
    useEffect(paintVerticalRuler, [paintVerticalRuler, rerenderId]);
    useEffect(() => setRerenderId(performance.now()), [configuring, monitoring]);
    useLayoutEffect(() => {
        let secondFrame = 0;
        const firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => {
                setRerenderId(performance.now());
                audioEditor.emit("uiResized");
            });
        });
        return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
        };
    }, [activeLayerIndex, audioEditor, configuring, monitoring, overlayMode]);
    useEffect(() => {
        if (!visualizersState[activeLayerIndex]) setActiveLayerIndex(Math.max(1, visualizersState.length - 1));
    }, [activeLayerIndex, setActiveLayerIndex, visualizersState]);

    const [viewStart, viewEnd] = viewRange;
    const [selStart, selEnd] = selRange || [0, 0];
    const selLeft = getCssFromPosition(viewRange, selStart);
    const selWidth = getCssFromPosition(viewRange, selStart, selEnd);
    const playheadLeft = getCssFromPosition(viewRange, playhead);
    const moduleCommonProps = { ...props, rerenderId };
    const hasCanvasAxis = (index: number) => {
        const id = visualizersState[index]?.moduleId ?? "";
        return !!id && id !== "embedding.semantic-description" && !id.includes("marker");
    };
    let axisLayerIndex = activeLayerIndex;
    if (overlayMode && !hasCanvasAxis(activeLayerIndex)) {
        for (let index = visualizersState.length - 1; index > 0; index--) {
            if (visualizersState[index].visible && hasCanvasAxis(index)) { axisLayerIndex = index; break; }
        }
    }
    const sidebarHost = document.getElementById("standalone-layers-host");
    const inlinePanels = !sidebarHost;
    const layersPanel = <div className={`editor-layers-panel${layersOpen ? "" : " collapsed"}`}>
        <div className="editor-layers-header"><strong>{t("Layers")}</strong><span>{visualizersState.length - 1}</span><VSCodeButton appearance="icon" aria-label={t(layersOpen ? "Collapse layers" : "Expand layers")} title={t(layersOpen ? "Collapse layers" : "Expand layers")} onClick={() => setLayersOpen(value => !value)}><span className={`codicon codicon-chevron-${layersOpen ? "down" : "right"}`} /></VSCodeButton></div>
        {layersOpen ? <><div className="editor-layer-layout" role="group" aria-label={t("Layer layout")}>
            <VSCodeButton appearance="secondary" className={!overlayMode ? "active" : ""} onClick={() => setOverlayMode(false)}>{t("Columns")}</VSCodeButton>
            <VSCodeButton appearance="secondary" className={overlayMode ? "active" : ""} onClick={() => setOverlayMode(true)}>{t("Overlay")}</VSCodeButton>
        </div>
        <div className="editor-layers-list">
            {visualizersState.map((layer, i) => ({ layer, i })).slice(1).reverse().map(({ layer, i }) => {
                const displayName = layer.state.name ? `${layer.state.name} - ${t(layer.moduleName)}` : t(layer.moduleName);
                return <div key={`${layer.moduleId}:${i}`} className={`editor-layer${activeLayerIndex === i ? " active" : ""}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (draggedLayerIndex !== null && draggedLayerIndex !== i) { audioEditor.moveModule(draggedLayerIndex, i); setActiveLayerIndex(i); } setDraggedLayerIndex(null); }} onClick={() => setActiveLayerIndex(i)}>
                    <div className="editor-layer-main">
                        <VSCodeButton appearance="icon" title={t(layer.visible ? "Hide layer" : "Show layer")} aria-label={t(layer.visible ? "Hide layer" : "Show layer")} onClick={e => { e.stopPropagation(); audioEditor.setModuleVisible(i, !layer.visible); }}><span className={`codicon codicon-eye${layer.visible ? "" : "-closed"}`} /></VSCodeButton>
                        <span className="codicon codicon-gripper" draggable onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); setDraggedLayerIndex(i); }} onDragEnd={() => setDraggedLayerIndex(null)} title={t("Drag to reorder layer")} />
                        <span className="editor-layer-name" title={displayName}>{displayName}</span>
                        <VSCodeButton appearance="icon" title={t("Delete layer")} aria-label={t("Delete layer")} onClick={e => { e.stopPropagation(); handleClickRemoveVisualizer(i); }}><span className="codicon codicon-trash" /></VSCodeButton>
                    </div>
                    {overlayMode && layer.visible ? <label className="editor-layer-opacity" onClick={e => e.stopPropagation()}>
                        <span>{t("Opacity")}</span><input aria-label={`${displayName} ${t("opacity")}`} type="range" min="0" max="1" step="0.05" value={layer.state.overlayOpacity ?? 1} onChange={e => audioEditor.modulesInstance[i].setState({ ...layer.state, overlayOpacity: Number(e.target.value) })} /><output>{Math.round((layer.state.overlayOpacity ?? 1) * 100)}%</output>
                    </label> : null}
                </div>;
            })}
        </div>
        <div className="editor-layers-hint">{t("Drag the grip to reorder · top layers draw in front")}</div></> : null}
    </div>;
    return (
        <div className="editor-main">
            {sidebarHost ? createPortal(layersPanel, sidebarHost) : null}
            <div className={`editor-main-flex${overlayMode ? " overlay-mode" : ""}${annotationSession?.annotations.length ? " annotation-track-visible" : ""}`}>
                <div className={`editor-main-playhead-container${inlinePanels && configuring ? " configuring" : ""}${inlinePanels && monitoring ? " monitoring" : ""}`} hidden={playhead < viewStart || playhead > viewEnd}>
                    <div className="editor-main-playhead-handler" style={{ left: playheadLeft }} onMouseDown={handlePlayheadHandlerMouseDown} />
                    <div className="editor-main-playhead" style={{ left: playheadLeft }}></div>
                </div>
                <div className={`editor-main-vertical-ruler-area${inlinePanels && configuring ? " configuring" : ""}${inlinePanels && monitoring ? " monitoring" : ""}`} ref={divVerticalRulerRef} onMouseDown={handlePlayheadHandlerMouseDown} onDoubleClick={handlePlayheadHandlerDoubleClick}>
                    <canvas ref={canvasVerticalRulerRef} />
                    <div className="editor-main-selrange-handler" ref={divSelRangeRef} style={{ left: selLeft, width: `calc(${selWidth} - 4px)` }} hidden={!selRange} >
                        <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                        <div className="editor-main-selrange-mover" onMouseDown={handleSelRangeMoveMouseDown} />
                        <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                    </div>
                </div>
                <AnnotationTimeline viewRange={viewRange} sampleRate={audioEditor.sampleRate} />
                {layersOpen && !sidebarHost ? layersPanel : null}
                <div className="editor-main-divider" />
                {visualizersState.map(({ moduleName, visible, state }, i) => {
                    if (i === 0) return undefined;
                    const { name } = state;
                    const module = audioEditor.modulesInstance[i];
                    const { Component } = module;
                    const displayName = name ? `${name} - ${t(moduleName)}` : t(moduleName);
                    return (<Fragment key={`${module.moduleId}:${i}`}>
                        <div className={`editor-main-visualizer-container${visible ? "" : " collapse"}${activeLayerIndex === i ? " active-layer" : ""}${axisLayerIndex === i ? " axis-layer" : ""}`} style={{ flex: typeof visible === "number" ? `0 0 ${visible}px` : visible ? "1 1 auto" : "0 0 auto", ...(overlayMode ? { zIndex: i, opacity: Math.max(0, Math.min(1, state.overlayOpacity ?? 1)) } : {}) }} onMouseDown={() => setActiveLayerIndex(i)}>
                            <div className="editor-main-visualizer-label">
                                <VSCodeButton appearance="icon" title={t(visible ? "Collapse" : "Expand")} tabIndex={-1} onClick={() => handleClickCollapseVisualizer(i)}>
                                    <span className={`codicon codicon-chevron-${visible ? "down" : "right"}`}></span>
                                </VSCodeButton>
                                <VSCodeButton className="editor-main-visualizer-container-mover" appearance="icon" title={t("Move")} tabIndex={-1} onMouseDown={(e) => handleMouseDownMoveVisualizer(e, i)}>
                                    <span className="codicon codicon-move"></span>
                                </VSCodeButton>
                                <div className="editor-main-visualizer-label-container" title={displayName}>
                                    <span>{displayName}</span>
                                </div>
                                <VSCodeButton className="editor-main-visualizer-delete" appearance="icon" title={t("Delete")} tabIndex={-1} onMouseDown={(e) => handleClickRemoveVisualizer(i)}>
                                    <span className="codicon codicon-trash"></span>
                                </VSCodeButton>
                            </div>
                            <div className={`editor-main-visualizer-component${inlinePanels && configuring ? " configuring" : ""}${inlinePanels && monitoring ? " monitoring" : ""}`} onMouseDownCapture={() => setActiveLayerIndex(i)} onFocusCapture={() => setActiveLayerIndex(i)} onKeyDown={handleStopPropagation} onKeyUp={handleStopPropagation}>
                                <ModuleErrorBoundary moduleName={displayName} onRemove={() => handleClickRemoveVisualizer(i)}>
                                    <Component module={module} moduleIndex={i} moduleState={state} {...moduleCommonProps} activeLayer={activeLayerIndex === i} />
                                </ModuleErrorBoundary>
                            </div>
                        </div>
                        <div className={`editor-main-divider${visible ? " draggable" : ""}`} onMouseDown={visible ? (e) => handleDividerMouseDown(e, i) : undefined} />
                    </Fragment>);
                })}
            </div>
        </div>
    );
};

export default AudioEditorMain;
