import "./ModuleUsingMarker.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AudioToolkitModule, AudioToolkitModuleState, VisualizationOptions } from "../core/AudioToolkitModule";
import { AudioEditorContext } from "./contexts";
import { VSCodeButton, VSCodeProgressRing, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { getCssFromPosition } from "../utils";

export interface AudioMarker {
    position: number | [number, number];
    color: string;
    name: string;
}

export interface IAudioToolkitModuleUsingMarker<State extends AudioToolkitModuleState = any> extends AudioToolkitModule<State> {
    setMarkerPosition(markerIndex: number, position: number | [number, number]): any;
    getMarkersFromRange(range: [number, number]): number[];
    addMarker(position: number | [number, number], name?: string, color?: string): any;
    deleteMarker(...markerIndexes: number[]): any;
    setMarkerName(name: string, ...markerIndexes: number[]): any;
    setMarkerClassName(name: string): any;
    setMarkerColor(color: string, ...markerIndexes: number[]): any;
}

export interface ModuleUsingMarkerProps extends VisualizationOptions<IAudioToolkitModuleUsingMarker> {
    markerClassName: string;
    markerData: AudioMarker[];
    calculating?: boolean | [number, string];
    backgroundOpacity?: number;
    paintBackground?: (canvasRef: React.RefObject<HTMLCanvasElement>) => void | Promise<void>;
    paintVerticalRuler: (canvasRef: React.RefObject<HTMLCanvasElement>) => void | Promise<void>;
    repaintId?: any;
    configurationContent?: JSX.Element;
    configurationContentChildren?: JSX.Element;
    monitorContent?: JSX.Element;
}

function formatMarkerTime(samples: number, sampleRate: number) {
    const seconds = Math.max(0, samples / sampleRate);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    return minutes ? `${minutes}:${remainder.toFixed(3).padStart(6, "0")}` : `${remainder.toFixed(3)} s`;
}

const ModuleUsingMarker: FunctionComponent<ModuleUsingMarkerProps> = (props) => {
    const {
        markerClassName, markerData,
        module, calculating,
        paintBackground, paintVerticalRuler, 
        backgroundOpacity,
        configurationContent, configurationContentChildren, monitorContent,
        viewRange, enabledChannels, selRange, playhead,
        configuring, monitoring, overlayMode, activeLayer, rerenderId, repaintId
    } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const randomColor = useRef(`#${Math.floor(Math.random() * (16 ** 6)).toString(16).padStart(6, "0")}`).current;
    const [selectedMarkers, setSelectedMarkers] = useState<number[]>([]);
    const [bulkSelRange, setBulkSelRange] = useState<[number, number] | null>(null);
    const [markerName, setMarkerName] = useState(selectedMarkers.length ? markerData[selectedMarkers[0]]?.name : `#${markerData.length + 1}`);
    const [color, setColor] = useState(selectedMarkers.length ? markerData[selectedMarkers[0]]?.color : markerData.length ? markerData[markerData.length - 1].color : randomColor);
    const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const divMainRef = useRef<HTMLDivElement>(null);
    const [layoutRevision, setLayoutRevision] = useState(0);
    useEffect(() => {
        if (paintBackground) void Promise.resolve().then(() => paintBackground(backgroundCanvasRef)).catch(error => console.error("Marker background paint failed.", error));
    }, [layoutRevision, paintBackground, rerenderId, repaintId]);
    useEffect(() => {
        void Promise.resolve().then(() => paintVerticalRuler(canvasVerticalRulerRef)).catch(error => console.error("Marker ruler paint failed.", error));
    }, [layoutRevision, paintVerticalRuler, rerenderId, repaintId]);
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
        if (!divMainRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = divMainRef.current.getBoundingClientRect();
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
        if (!divMainRef.current || !selRange) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = divMainRef.current.getBoundingClientRect();
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
    const handleOldMarkersContainerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        setBulkSelRange(null);
        if (!e.ctrlKey && !e.metaKey) setSelectedMarkers([]);
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const origin = { x: e.clientX, y: e.clientY };
        const rect = e.currentTarget.getBoundingClientRect();
        const playhead = viewStart + (e.clientX - rect.left) / rect.width * viewLength;
        audioEditor.setPlayhead(playhead);
        if (!e.ctrlKey && !e.metaKey) audioEditor.setSelRange(null);
        const selectedMarkersSet = new Set(selectedMarkers);
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const x = e.clientX;
            if (x === origin.x) {
                setBulkSelRange(null);
            } else {
                if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
                else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
                const [viewStart, viewEnd] = audioEditor.state.viewRange;
                const viewLength = viewEnd - viewStart;
                const to = viewStart + Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * viewLength;
                const range = [playhead, to].sort((a, b) => a - b) as [number, number];
                setBulkSelRange(range);
                audioEditor.setSelRange(range);
                const markersInRange = module.getMarkersFromRange(range);
                if (e.ctrlKey || e.metaKey) {
                    const set = new Set(selectedMarkersSet);
                    markersInRange.forEach((i) => {
                        if (set.has(i)) set.delete(i);
                        else set.add(i);
                    });
                    setSelectedMarkers([...set]);
                } else {
                    setSelectedMarkers(markersInRange);
                }
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            setBulkSelRange(null);
            audioEditor.emitSelRangeToPlay();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [audioEditor, module, selectedMarkers, viewRange]);
    const handleClickAddMarker = useCallback((e: React.MouseEvent<HTMLElement>) => module.addMarker(selRange ?? playhead, markerName, color), [module, selRange, playhead, markerName, color]);
    const handleAddMarkerMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
        setSelectedMarkers([]);
        e.stopPropagation();
        e.preventDefault();
    }, []);

    const handleWindowKeyDown = useCallback((e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.matches("input, textarea, [contenteditable=true]")) return;
        if (selectedMarkers.length && (e.key === "Delete" || e.key === "Backspace")) {
            module.deleteMarker(...selectedMarkers);
            e.stopPropagation();
        }
    }, [module, selectedMarkers]);
    useEffect(() => {
        setMarkerName(selectedMarkers.length ? markerData[selectedMarkers[0]]?.name : `#${markerData.length + 1}`);
        setColor(color => selectedMarkers.length ? markerData[selectedMarkers[0]]?.color ?? color : markerData.length ? markerData[markerData.length - 1].color : color);
    }, [markerData, selectedMarkers]);
    useEffect(() => {
        setSelectedMarkers(current => current.filter(index => index < markerData.length));
    }, [markerData.length]);
    useEffect(() => {
        window.addEventListener("keydown", handleWindowKeyDown);
        return () => {
            window.removeEventListener("keydown", handleWindowKeyDown);
        };
    }, [handleWindowKeyDown]);
    const [viewStart, viewEnd] = viewRange;
    const [selStart, selEnd] = selRange || [0, 0];
    const selLeft = getCssFromPosition(viewRange, selStart);
    const selWidth = getCssFromPosition(viewRange, selStart, selEnd);
    const playheadLeft = getCssFromPosition(viewRange, playhead);
    const [bulkSelStart, bulkSelEnd] = bulkSelRange || [0, 0];
    const bulkSelLeft = getCssFromPosition(viewRange, bulkSelStart);
    const bulkSelWidth = getCssFromPosition(viewRange, bulkSelStart, bulkSelEnd);
    const calculatingError = Array.isArray(calculating) && calculating[0] < 0 ? calculating[1] : null;
    const allMarkers: {
        index: number;
        name: string;
        time: string;
        color: string;
        start: number;
        end: number;
        left: string;
        width: string;
        row: number;
        selected: boolean;
        handleMarkerResizeStartMouseDown: React.MouseEventHandler<HTMLDivElement>;
        handleMarkerResizeEndMouseDown: React.MouseEventHandler<HTMLDivElement>;
        handleMarkerMoveMouseDown: React.MouseEventHandler<HTMLDivElement>;
        handleMarkerDoubleClick: React.MouseEventHandler<HTMLDivElement>;
        handleMarkerKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
        labelCollides?: boolean;
    }[][] = [];
    let row = 0;
    let selected = false;
    let left: string;
    let width: string;
    markerData.forEach(({ position, name, color }, i) => {
        let start = 0;
        let end = 0;
        if (typeof position === "number") {
            start = position;
            end = position;
        } else {
            [start, end] = position;
        }
        if (end < viewStart || start > viewEnd) return;
        row = 0;
        while (allMarkers.flat().find((marker) => marker.row === row && !(marker.end <= start || marker.start >= end))) {
            row++;
        };
        selected = selectedMarkers.indexOf(i) !== -1;
        const handleMarkerResizeStartMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            e.preventDefault();
            const rect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
            let $start = start;
            const handleMouseMove = (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (e.movementX) {
                    const x = e.clientX;
                    if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
                    else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
                    const [viewStart, viewEnd] = audioEditor.state.viewRange;
                    const viewLength = viewEnd - viewStart;
                    $start = viewStart + (x - rect.left) / rect.width * viewLength;
                    audioEditor.makingEdit = false;
                    module.setMarkerPosition(i, [$start, end]);
                    audioEditor.makingEdit = true;
                }
            };
            const handleMouseUp = (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                module.setMarkerPosition(i, [$start, end]);
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        };
        const handleMarkerResizeEndMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            e.preventDefault();
            const rect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
            let $end = end;
            const handleMouseMove = (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (e.movementX) {
                    const x = e.clientX;
                    if (x > rect.right) audioEditor.scrollH((x - rect.right) / 1000);
                    else if (x < rect.left) audioEditor.scrollH((x - rect.left) / 1000);
                    const [viewStart, viewEnd] = audioEditor.state.viewRange;
                    const viewLength = viewEnd - viewStart;
                    $end = viewStart + (x - rect.left) / rect.width * viewLength;
                    audioEditor.makingEdit = false;
                    module.setMarkerPosition(i, [start, $end]);
                    audioEditor.makingEdit = true;
                }
            };
            const handleMouseUp = (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                module.setMarkerPosition(i, [start, $end]);
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        };
        const handleMarkerMoveMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                setSelectedMarkers(current => current.includes(i) ? current.filter(index => index !== i) : [...current, i]);
            } else setSelectedMarkers([i]);
            const { currentTarget } = e;
            const rect = currentTarget.parentElement!.getBoundingClientRect();
            currentTarget.style.cursor = "grabbing";
            const [viewStart, viewEnd] = audioEditor.state.viewRange;
            const viewLength = viewEnd - viewStart;
            const origin = viewStart + (e.clientX - rect.left) / rect.width * viewLength;
            let $position = position;
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
                    if (typeof position === "number") {
                        $position = start;
                    } else {
                        const deltaSamples = start - origin;
                        $position = position.map(p => p + deltaSamples) as [number, number];
                    }
                    audioEditor.makingEdit = false;
                    module.setMarkerPosition(i, $position);
                    audioEditor.makingEdit = true;
                }
            };
            const handleMouseUp = (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (currentTarget) currentTarget.style.cursor = "grab";
                module.setMarkerPosition(i, $position);
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        };
        const handleMarkerDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
            if (start === end) audioEditor.setPlayhead(start);
            else audioEditor.setSelRange([start, end]);
        };
        const handleMarkerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Enter") {
                if (start === end) audioEditor.setPlayhead(start);
                else audioEditor.setSelRange([start, end]);
            } else if (e.key === " ") {
                setSelectedMarkers(current => current.includes(i) ? current.filter(index => index !== i) : [...current, i]);
            } else return;
            e.preventDefault();
            e.stopPropagation();
        };
        left = getCssFromPosition(viewRange, start);
        width = `max(${getCssFromPosition(viewRange, start, end)}, 6px)`;
        if (!allMarkers[row]) allMarkers[row] = [];
        const time = start === end
            ? formatMarkerTime(start, audioEditor.sampleRate)
            : `${formatMarkerTime(start, audioEditor.sampleRate)} – ${formatMarkerTime(end, audioEditor.sampleRate)}`;
        allMarkers[row].push({ index: i, name, time, color, start, end, left, width, row, selected, handleMarkerMoveMouseDown, handleMarkerResizeEndMouseDown, handleMarkerResizeStartMouseDown, handleMarkerDoubleClick, handleMarkerKeyDown });
    });
    const pointMarkers = allMarkers.flat().filter(marker => marker.start === marker.end).sort((a, b) => a.start - b.start);
    const visualizationWidth = divMainRef.current?.clientWidth ?? window.innerWidth;
    pointMarkers.forEach((marker, index) => {
        const next = pointMarkers[index + 1];
        const availablePixels = ((next?.start ?? viewEnd) - marker.start) / Math.max(1, viewEnd - viewStart) * visualizationWidth;
        const estimatedLabelWidth = Math.min(220, Math.max(48, (marker.name || `Marker ${marker.index + 1}`).length * 7 + 18));
        marker.labelCollides = availablePixels < estimatedLabelWidth + 18;
    });
    const firstVisibleMarker = allMarkers.flat()[0]?.index;
    return (<>
        <div className={`visualizer-component-container module-using-marker-container ${module.moduleId.replace(".", "-")}-container`}>
            <div className="module-using-marker-background">
                <canvas style={{ opacity: backgroundOpacity ?? 1 }} ref={backgroundCanvasRef} />
            </div>
            <div className="module-using-marker-vertical-ruler-container">
                <canvas ref={canvasVerticalRulerRef} />
            </div>
            <div ref={divMainRef} className="markers-container visualizer-component-visualization-area" onWheel={handleWheel}>
                <div className="markers">
                    <div className="marker-selection-overlay selrange" style={{ left: selLeft, width: selWidth }} hidden={!selRange}>
                        <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                        <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                        <VSCodeButton className="marker-add-button marker-selection-add" tabIndex={-1} aria-label="Add range marker" title="Add range marker from selection" appearance="icon" onClick={handleClickAddMarker} onMouseDown={handleAddMarkerMouseDown}>
                            <span className="codicon codicon-add"></span>
                        </VSCodeButton>
                    </div>
                    <div className="marker-playhead-overlay">
                        {
                            playhead < viewStart || playhead > viewEnd
                            ? null
                            : !selRange && (!overlayMode || activeLayer) ? <div className="playhead" style={{ left: playheadLeft }}>
                                <VSCodeButton className="marker-add-button marker-point-add" tabIndex={-1} aria-label="Add Marker" title="Add marker at playhead" appearance="icon" onClick={handleClickAddMarker} onMouseDown={handleAddMarkerMouseDown}>
                                    <span className="codicon codicon-add"></span>
                                </VSCodeButton>
                            </div> : null
                        }
                    </div>
                    <div className="old-markers-container" onMouseDown={handleOldMarkersContainerMouseDown}>
                        <div className="selrange" style={{ left: bulkSelLeft, width: bulkSelWidth }} hidden={!bulkSelRange}></div>
                        {
                            allMarkers.map((row, i) => (
                                <div key={i} className="markers-row">
                                    {
                                        row.map(({ index, name, time, color, start, end, left, width, selected, labelCollides, handleMarkerMoveMouseDown, handleMarkerResizeStartMouseDown, handleMarkerResizeEndMouseDown, handleMarkerDoubleClick, handleMarkerKeyDown }) => (
                                            <div key={index} role="button" tabIndex={selected || (!selectedMarkers.length && index === firstVisibleMarker) ? 0 : -1} aria-label={`${name || `Marker ${index + 1}`}, ${time}`} aria-pressed={selected} title={`${name ? `${name} · ` : ""}${time}`} className={`marker${start === end ? " point" : " range"}${selected ? " selected" : ""}${labelCollides ? " label-collides" : ""}`} style={{ left, ...(start === end ? {} : { width }), "--marker-color": color } as React.CSSProperties} onMouseDown={handleMarkerMoveMouseDown} onDoubleClick={handleMarkerDoubleClick} onKeyDown={handleMarkerKeyDown}>
                                                <span className="marker-label"><strong>{name || `Marker ${index + 1}`}</strong><small>{time}</small></span>
                                                {
                                                    start === end
                                                    ? undefined
                                                    : <>
                                                        <div className="resize-handler resize-handler-w" onMouseDown={handleMarkerResizeStartMouseDown} />
                                                        <div className="resize-handler resize-handler-e" onMouseDown={handleMarkerResizeEndMouseDown} />
                                                    </>
                                                }
                                            </div>
                                        ))
                                    }
                                </div>
                            ))
                        }
                    </div>
                </div>
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
        <div className={`visualizer-component-configuration module-using-marker-configuration ${module.moduleId.replace(".", "-")}-configuration-container`}>
            {configurationContent ?? <div className="default-layout">{configurationContentChildren}{props.configurationMode === "appearance" ? <MarkerConfiguration {...{ module, selectedMarkers, setSelectedMarkers, color, setColor, markerClassName, markerName, setMarkerName }} /> : <div className="configuration-kind"><strong>Analysis</strong><span>This manual marker layer has no analysis parameters.</span></div>}</div>}
        </div>
        <div className="visualizer-component-monitor">{monitorContent}</div>
    </>);
};

interface MarkerConfigurationProps {
    module: IAudioToolkitModuleUsingMarker;
    selectedMarkers: number[];
    setSelectedMarkers: React.Dispatch<React.SetStateAction<number[]>>;
    color: string;
    setColor: React.Dispatch<React.SetStateAction<string>>;
    markerClassName: string;
    markerName: string;
    setMarkerName: React.Dispatch<React.SetStateAction<string>>;
}

const MarkerConfiguration: FunctionComponent<MarkerConfigurationProps> = (props) => {
    const { module, selectedMarkers, setSelectedMarkers, color, setColor, markerClassName, markerName, setMarkerName } = props;
    const [id1, id2, id3] = [useId(), useId(), useId()];
    
    const handleClickDeleteMarker = useCallback(() => {
        module.deleteMarker(...selectedMarkers);
        setSelectedMarkers([]);
    }, [module, selectedMarkers, setSelectedMarkers]);
    const handleInputMarkerClass: (((e: Event) => unknown) & React.FormEventHandler<HTMLInputElement>) = useCallback((e) => {
        module.setMarkerClassName((e.currentTarget as HTMLInputElement).value);
    }, [module]);
    const handleChangeMarkerColor: (((e: Event) => unknown) & React.FormEventHandler<HTMLInputElement>) = useCallback((e) => {
        const color = (e.currentTarget as HTMLInputElement).value;
        module.setMarkerColor(color, ...selectedMarkers);
        setColor(color);
    }, [module, selectedMarkers, setColor]);
    const handleInputMarkerName: (((e: Event) => unknown) & React.FormEventHandler<HTMLInputElement>) = useCallback((e) => {
        const name = (e.currentTarget as HTMLInputElement).value;
        if (selectedMarkers.length) module.setMarkerName(name, ...selectedMarkers);
        else setMarkerName(name);
    }, [module, selectedMarkers, setMarkerName]);

    return (<>
        <div className="marker-selection-summary">
            <span>{selectedMarkers.length ? `${selectedMarkers.length} selected` : "No marker selected"}</span>
            <span>Ctrl/Cmd-click for multi-select</span>
        </div>
        <div>
            <label htmlFor={id1}>Marker track</label>
            <VSCodeTextField id={id1} placeholder="Marker Class" onInput={handleInputMarkerClass} value={markerClassName} />
        </div>
        <div>
            <label htmlFor={id2}>{selectedMarkers.length ? "Selected marker color" : "New marker color"}</label>
            <input id={id2} type="color" name="marker-color" value={color} onChange={handleChangeMarkerColor} />
        </div>
        <div>
            <label htmlFor={id3}>{selectedMarkers.length ? "Selected marker label" : "New marker label"}</label>
            <VSCodeTextField id={id3} placeholder="Marker Name" onInput={handleInputMarkerName} value={markerName} />
        </div>
        {
            selectedMarkers.length
            ? <div>
                <VSCodeButton className="marker-button-delete" tabIndex={-1} aria-label="Delete Marker" title="Delete Marker" appearance="secondary" onClick={handleClickDeleteMarker}>Delete</VSCodeButton>
            </div>
            : null
        }
    </>);
};

export default ModuleUsingMarker;
