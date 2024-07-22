import "./AudioEditorMain.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { AudioEditorContext } from "./contexts";
import AudioEditorWaveform from "./AudioEditorWaveform";
import AudioEditorSpectrogram from "./AudioEditorSpectrogram";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { VisualizationOptions, VisualizationStyleOptions, VisualizersState } from "../core/AudioToolkitModule";
import { getRuler, setCanvasToFullSize } from "../utils";

interface Props extends Pick<AudioEditorState, "playhead" | "selRange" | "viewRange" | "enabledChannels">, VisualizationStyleOptions {
    configuration: AudioEditorConfiguration;
    windowSize: number[];
}

const visualizersMap: Record<string, FunctionComponent<VisualizationOptions<any>>> = {
    "Waveform": AudioEditorWaveform,
    "Spectrogram": AudioEditorSpectrogram 
};
 
const AudioEditorMain: FunctionComponent<Props> = (props) => {
    const { playhead, viewRange, selRange, windowSize, gridRulerColor, textColor, labelFont, configuration: { audioUnit, beatsPerMeasure, beatsPerMinute, division } } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const divSelRangeRef = useRef<HTMLDivElement>(null);
    const divVerticalRulerRef = useRef<HTMLDivElement>(null);
    const canvasVerticalRulerRef = useRef<HTMLCanvasElement>(null);
    const [visualizersState, setVisualizersState] = useState<VisualizersState>(/*vscode.getState() as VisualizersState ||*/ [{ name: "Waveform", visible: true, state: null }, { name: "Spectrogram", visible: true, state: null }]);
    const [rerenderTimestamp, setRerenderTimestamp] = useState(performance.now());
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
                setVisualizersState((state) => {
                    state[visualizerIndex] = { ...state[visualizerIndex], visible: height };
                    return state.slice();
                });
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
    }, []);
    const handleClickCollapseVisualizer = useCallback((visualizerIndex: number) => {
        setVisualizersState((state) => {
            state[visualizerIndex] = { ...state[visualizerIndex], visible: !state[visualizerIndex].visible };
            return state.slice();
        });
    }, []);
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
        dividers.splice(visualizerIndex + 1, 1);
        let moveToIndex = visualizerIndex;
        dividers[visualizerIndex].classList.add("active");
        setRerenderTimestamp(performance.now());
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
                    moveToIndex = i;
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
                setVisualizersState((state) => {
                    const [vs] = state.splice(visualizerIndex, 1);
                    state.splice(moveToIndex, 0, vs);
                    return state.slice();
                });
            }
            setRerenderTimestamp(performance.now());
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, []);
    const onSaveState = useCallback(async (moduleIndex: number, state: any) => {
        setVisualizersState((prevState) => {
            prevState[moduleIndex] = { ...prevState[moduleIndex], state };
            const nextState = prevState.slice();
            // vscode.setState<VisualizersState>(nextState);
            return nextState;
        });
    }, []);
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
    useEffect(() => setRerenderTimestamp(performance.now()), [windowSize, visualizersState]);
    // useEffect(() => void vscode.setState(visualizersState), [visualizersState]);
    useEffect(paintVerticalRuler, [paintVerticalRuler]);

    const [viewStart, viewEnd] = viewRange;
    const viewLength = viewEnd - viewStart;
    const [selStart, selEnd] = selRange || [0, 0];
    const $selStart = (selStart - viewStart) / viewLength;
    const $selEnd = (selEnd - viewStart) / viewLength;
    const selLeft = `${$selStart * 100}%`;
    const selWidth = `${($selEnd - $selStart) * 100}%`;
    const $playhead = (playhead - viewStart) / viewLength;
    const playheadLeft = `${$playhead * 100}%`;
    const moduleCommonProps = { ...props, rerenderTimestamp, onSaveState };
    return (
        <div className="editor-main">
            <div className="editor-main-flex">
                <div className="editor-main-playhead-container" hidden={$playhead < 0 || $playhead > 1}>
                    <div className="editor-main-playhead-handler" style={{ left: playheadLeft }} onMouseDown={handlePlayheadHandlerMouseDown} />
                    <div className="editor-main-playhead" style={{ left: playheadLeft }}></div>
                </div>
                <div className="editor-main-vertical-ruler-area" ref={divVerticalRulerRef} onMouseDown={handlePlayheadHandlerMouseDown} onDoubleClick={handlePlayheadHandlerDoubleClick}>
                    <canvas ref={canvasVerticalRulerRef} />
                    <div className="editor-main-selrange-handler" ref={divSelRangeRef} style={{ left: selLeft, width: `calc(${selWidth} - 4px)` }} hidden={!selRange} >
                        <div className="resize-handler resize-handler-w" onMouseDown={handleResizeStartMouseDown} />
                        <div className="editor-main-selrange-mover" onMouseDown={handleSelRangeMoveMouseDown} />
                        <div className="resize-handler resize-handler-e" onMouseDown={handleResizeEndMouseDown} />
                    </div>
                </div>
                <div className="editor-main-divider" />
                {visualizersState.map(({ name, visible }, i) => {
                    const Component = visualizersMap[name];
                    return (<>
                        <div key={i} className={`editor-main-visualizer-container${visible ? "" : " collapse"}`} style={{ flex: typeof visible === "number" ? `0 0 ${visible}px` : visible ? "1 1 auto" : "0 0 auto" }}>
                            <div className="editor-main-visualizer-label">
                                <VSCodeButton appearance="icon" title={visible ? "Collapse" : "Expand"} tabIndex={-1} onClick={() => handleClickCollapseVisualizer(i)}>
                                    <span className={`codicon codicon-chevron-${visible ? "down" : "right"}`}></span>
                                </VSCodeButton>
                                <VSCodeButton className="editor-main-visualizer-container-mover" appearance="icon" title="Move" tabIndex={-1} onMouseDown={(e) => handleMouseDownMoveVisualizer(e, i)}>
                                    <span className="codicon codicon-move"></span>
                                </VSCodeButton>
                                <span>{name}</span>
                            </div>
                            {visible ? <div className="editor-main-visualizer-component"><Component module={null} moduleIndex={i} {...moduleCommonProps} /></div> : undefined}
                        </div>
                        <div className={`editor-main-divider${visible ? " draggable" : ""}`} onMouseDown={visible ? (e) => handleDividerMouseDown(e, i) : undefined} />
                    </>);
                })}
            </div>
        </div>
    );
};

export default AudioEditorMain;
