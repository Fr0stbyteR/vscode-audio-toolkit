import "./MarkerComponent.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AudioEditorContext } from "../../components/contexts";
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Marker from "./Marker";

const MarkerComponent: FunctionComponent<VisualizationOptions<Marker>> = ({ module, moduleState, viewRange, selRange, playhead, enabledChannels, phosphorColor, playheadColor, gridColor, gridRulerColor, textColor, monospaceFont, configuration, rerenderTimestamp }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const [selectedMarker, setSelectedMarker] = useState<number>(-1);
    const [markerName, setMarkerName] = useState(moduleState.data[selectedMarker]?.name ?? `#${moduleState.data.length + 1}`);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const divMainRef = useRef<HTMLDivElement>(null);
    const paintVerticalRuler = useCallback(() => {
        const canvas = canvasVerticalRulerRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        module.paintVerticalRuler(ctx, { width, height, gridLabels: false }, { viewRange, configuration }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [module, viewRange, configuration, gridColor, gridRulerColor, textColor, monospaceFont]);
    useEffect(paintVerticalRuler, [paintVerticalRuler, rerenderTimestamp]);
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
    const handleContainerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => setSelectedMarker(-1), []);
    const handleClickDeleteMarker = useCallback((e: React.MouseEvent<HTMLDivElement>) => module.deleteMarker(selectedMarker), [module, selectedMarker]);
    const handleClickAddMarker = useCallback((e: React.MouseEvent<HTMLDivElement>) => module.addMarker(selRange ?? playhead, markerName), [module, selRange, playhead, markerName]);
    const handleInputMarkerClass: (((e: Event) => unknown) & React.FormEventHandler<HTMLInputElement>) = useCallback((e) => module.setMarkerClassName((e.currentTarget as HTMLInputElement).value), [module]);
    const handleInputMarkerColor: (((e: Event) => unknown) & React.FormEventHandler<HTMLInputElement>) = useCallback((e) => module.setMarkerColor((e.currentTarget as HTMLInputElement).value), [module]);
    const handleInputMarkerName: (((e: Event) => unknown) & React.FormEventHandler<HTMLInputElement>) = useCallback((e) => {
        const name = (e.currentTarget as HTMLInputElement).value;
        if (selectedMarker >= 0) module.setMarkerName(selectedMarker, name);
        else setMarkerName(name);
    }, [module, selectedMarker]);
    useEffect(() => setMarkerName(moduleState.data[selectedMarker]?.name ?? `#${moduleState.data.length + 1}`), [moduleState, selectedMarker]);

    const [viewStart, viewEnd] = viewRange;
    const viewLength = viewEnd - viewStart;
    const [selStart, selEnd] = selRange || [0, 0];
    const $selStart = (selStart - viewStart) / viewLength;
    const $selEnd = (selEnd - viewStart) / viewLength;
    const selLeft = `${$selStart * 100}%`;
    const selWidth = `${($selEnd - $selStart) * 100}%`;
    const $playhead = (playhead - viewStart) / viewLength;
    const playheadLeft = `${$playhead * 100}%`;
    const allMarkers: {
        name: string;
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
    }[][] = [];
    let row = 0;
    let selected = false;
    let left: string;
    let width: string;
    const id1 = useId();
    const id2 = useId();
    moduleState.data.forEach(({ position, name }, i) => {
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
        selected = i === selectedMarker;
        const handleMarkerResizeStartMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            e.preventDefault();
            const rect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
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
                    module.setMarkerPosition(i, [start, end]);
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
        const handleMarkerResizeEndMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            e.preventDefault();
            const rect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
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
                    module.setMarkerPosition(i, [start, end]);
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
        const handleMarkerMoveMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            e.preventDefault();
            setSelectedMarker(i);
            const { currentTarget } = e;
            const rect = currentTarget.parentElement!.getBoundingClientRect();
            currentTarget.style.cursor = "grabbing";
            const [viewStart, viewEnd] = audioEditor.state.viewRange;
            const viewLength = viewEnd - viewStart;
            const origin = viewStart + (e.clientX - rect.left) / rect.width * viewLength;
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
                        module.setMarkerPosition(i, start);
                    } else {
                        const deltaSamples = start - origin;
                        module.setMarkerPosition(i, position.map(p => p + deltaSamples) as [number, number]);
                    }
                }
            };
            const handleMouseUp = (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (currentTarget) currentTarget.style.cursor = "grab";
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        };
        const handleMarkerDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
            if (start === end) module.audioEditor.setPlayhead(start);
            else module.audioEditor.setSelRange([start, end]);
        };
        left = `${(start - viewStart) / viewLength * 100}%`;
        width = start === end ? "6px" : `${(end - start) / viewLength * 100}%`;
        if (!allMarkers[row]) allMarkers[row] = [];
        allMarkers[row].push({ name, start, end, left, width, row, selected, handleMarkerMoveMouseDown, handleMarkerResizeEndMouseDown, handleMarkerResizeStartMouseDown, handleMarkerDoubleClick });
    });
    return (<>
        <div className="visualizer-component-container marker-module-container">
            <div className="marker-background" />
            <div className="marker-vertical-ruler-container">
                <canvas ref={canvasVerticalRulerRef} />
            </div>
            <div ref={divMainRef} className="markers-container visualizer-component-visualization-area" onWheel={handleWheel} onMouseDown={handleContainerMouseDown}>
                <div className="markers">
                    {
                        allMarkers.map((row, i) => (
                            <div key={i} className="markers-row">
                                {
                                    row.map(({ name, start, end, left, width, selected, handleMarkerMoveMouseDown, handleMarkerResizeStartMouseDown, handleMarkerResizeEndMouseDown, handleMarkerDoubleClick }, j) => (
                                        <div key={j} className={`marker${start === end ? "" : " range"}${selected ? " selected" : ""}`} style={{ left, width, borderColor: moduleState.color }} onMouseDown={handleMarkerMoveMouseDown} onDoubleClick={handleMarkerDoubleClick}>
                                            <span>{name}</span>
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
                    <div className="markers-row new-marker-container">
                        <div className="selrange" style={{ left: selLeft, width: selWidth }} hidden={!selRange}>
                            <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                            <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                        </div>
                        <div className="playhead-container">
                            {
                                $playhead > 1 || $playhead < 0
                                ? null
                                : <div className="playhead" style={{ left: playheadLeft }}>
                                    <VSCodeButton tabIndex={-1} aria-label="Add Marker" title="Add Marker" appearance="icon" onClick={handleClickAddMarker}>
                                        <span className="codicon codicon-add"></span>
                                    </VSCodeButton>
                                </div>
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div className="visualizer-component-configuration">
            <div className="marker-configuration">
                <div>
                    <label htmlFor={id1}>Marker Class Name</label>
                    <VSCodeTextField placeholder="Marker Class" onInput={handleInputMarkerClass} value={moduleState.name} />
                </div>
                <div>
                    <label htmlFor={id2}>Label color</label>
                    <input type="color" name="marker-color" value={moduleState.color} id={id2} onInput={handleInputMarkerColor} />
                </div>
                <div>
                    <label htmlFor={id1}>Marker Name</label>
                    <VSCodeTextField placeholder="Marker Name" onInput={handleInputMarkerName} value={markerName} />
                </div>
                {
                    selectedMarker !== -1
                    ? <div>
                        <VSCodeButton className="marker-button-delete" tabIndex={-1} aria-label="Delete Marker" title="Delete Marker" appearance="secondary" onClick={handleClickDeleteMarker}>Delete</VSCodeButton>
                    </div>
                    : undefined
                }
            </div>
        </div>
    </>);
};

export default MarkerComponent;
