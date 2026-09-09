import "./AudioEditorMonitor.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react";
import { DataGridRowTypes } from "@vscode/webview-ui-toolkit";
import TimeInput from "./TimeInput";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { atodb, setCanvasToFullSize } from "../utils";
import { VisualizationStyleOptions } from "../core/AudioToolkitModule";

interface Props extends Pick<AudioEditorState, "playhead" | "selRange" | "viewRange">, Pick<VisualizationStyleOptions, "gridRulerColor" | "gridColor" | "textColor"> {
    monospaceFont: string;
    configuration: AudioEditorConfiguration;
    windowSize: number[];
}

const MIN_DB = -70;
const MAX_DB = 6;

const AudioEditorMonitor: FunctionComponent<Props> = ({ playhead, selRange, viewRange, gridRulerColor, gridColor, textColor, monospaceFont, configuration, windowSize }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const [values, setValues] = useState<number[]>([]);
    const [maxValues, setMaxValues] = useState<number[]>([]);
    const canvasMeterRef = useRef<HTMLCanvasElement>(null);
    const canvasGridRef = useRef<HTMLCanvasElement>(null);
    const maxValuesRef = useRef<number[]>([]);
    const rafRef = useRef(-1);
    const previousRafTimeRef = useRef(-1);
    const maxTimerRef = useRef(-1);
    const { sampleRate } = audioEditor;
    const handleChangeSelRangeStart = useCallback((samples: number) => {
        if (selRange) audioEditor.setSelRange([samples, selRange[1]]);
        else audioEditor.setPlayhead(samples);
    }, [audioEditor, selRange]);
    const handleChangeSelRangeEnd = useCallback((samples: number) => {
        if (selRange) audioEditor.setSelRange([selRange[0], samples]);
        else audioEditor.setSelRange([playhead, samples]);
    }, [audioEditor, playhead, selRange]);
    const handleChangeSelRangeDuration = useCallback((samples: number) => {
        if (selRange) audioEditor.setSelRange([selRange[0], selRange[0] + samples]);
        else audioEditor.setSelRange([playhead, playhead + samples]);
    }, [audioEditor, playhead, selRange]);
    const handleChangeViewRangeStart = useCallback((samples: number) => {
        audioEditor.setViewRange([samples, viewRange[1]]);
    }, [audioEditor, viewRange]);
    const handleChangeViewRangeEnd = useCallback((samples: number) => {
        audioEditor.setViewRange([viewRange[0], samples]);
    }, [audioEditor, viewRange]);
    const handleChangeViewRangeDuration = useCallback((samples: number) => {
        audioEditor.setViewRange([viewRange[0], viewRange[0] + samples]);
    }, [audioEditor, viewRange]);
    const frameRate = 60;
    const paintGrid = useCallback(() => {
        const canvas = canvasGridRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        if (width <= 0 || height <= 0) return;
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = gridRulerColor;
        ctx.fillStyle = textColor;
        ctx.font = `12px ${monospaceFont}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("dB", 10, 6);
        ctx.beginPath();
        let x: number;
        for (let db = -60; db <= 5; db += (width > 250 ? 1 : width > 100 ? 3 : 12)) {
            x = (db - MIN_DB) / (MAX_DB - MIN_DB) * width;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, db % 6 === 0 ? 4 : 2);
            if (db % (width > 250 ? 6 : width > 100 ? 12 : 36) === 0) ctx.fillText(db.toString(), x, 6);
        }
        ctx.stroke();
    }, [gridRulerColor, monospaceFont, textColor]);
    const paint = useCallback(() => {
        const canvas = canvasMeterRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const coldColor = "rgb(12, 248, 100)";
        const warmColor = "rgb(195, 248, 100)";
        const hotColor = "rgb(255, 193, 10)";
        const overloadColor = "rgb(255, 10, 10)";

        const [width, height] = setCanvasToFullSize(canvas);

        ctx.clearRect(0, 0, width, height);
        if (width <= 0 || height <= 0) return;
        const channels = values.length;
        const clipValue = 0;
        const channelHeight = (height + 1) / channels - 1;
        let x: number;
        let y = 0;
        let v: number;
        let histMax: number;
        ctx.fillStyle = gridColor;
        for (let channel = 1; channel < channels; channel++) {
            ctx.fillRect(0, channel * (channelHeight + 1) - 1, width, 1);
        }
        if (MIN_DB >= clipValue || clipValue >= MAX_DB) {
            const fgColor = MIN_DB >= clipValue ? overloadColor : coldColor;
            ctx.fillStyle = fgColor;
            for (let channel = 0; channel < channels; channel++) {
                v = values[channel];
                x = Math.max(0, Math.min(1, (v - MIN_DB) / (MAX_DB - MIN_DB))) * width;
                if (x > 0) ctx.fillRect(0, y, x, channelHeight);
                histMax = maxValues[channel];
                if (typeof histMax === "number" && histMax > v) {
                    x = Math.max(0, Math.min(1, (histMax - MIN_DB) / (MAX_DB - MIN_DB))) * width;
                    ctx.fillRect(Math.min(width - 1, x), y, 1, channelHeight);
                }
                y += channelHeight + 1;
            }
        } else {
            const clipX = Math.max(0, Math.min(1, (clipValue - MIN_DB) / (MAX_DB - MIN_DB))) * width;
            const clipWidth = width - clipX;
            const hotStop = width - clipWidth;
            const warmStop = hotStop - 1;
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, coldColor);
            gradient.addColorStop(warmStop / width, warmColor);
            gradient.addColorStop(hotStop / width, hotColor);
            gradient.addColorStop(1, overloadColor);
            ctx.fillRect(warmStop, 0, 1, height);
            ctx.fillStyle = gradient;
            x = 0;
            y = 0;
            for (let channel = 0; channel < channels; channel++) {
                v = values[channel];
                x = Math.max(0, Math.min(1, (v - MIN_DB) / (MAX_DB - MIN_DB))) * width;
                if (x > 0) ctx.fillRect(0, y, Math.min(warmStop, x), channelHeight);
                if (x > clipX) ctx.fillRect(hotStop, y, Math.min(clipWidth, x - clipX), channelHeight);
                histMax = maxValues[channel];
                if (typeof histMax === "number" && histMax > v) {
                    x = Math.max(0, Math.min(1, (histMax - MIN_DB) / (MAX_DB - MIN_DB))) * width;
                    if (x <= clipX) ctx.fillRect(x, y, 1, channelHeight);
                    else ctx.fillRect(Math.min(width - 1, x), y, 1, channelHeight);
                }
                y += channelHeight + 1;
            }
        }
        // if (audioEditor.state.playing === "playing") schedulePaint();
        // rafRef.current = requestAnimationFrame(scheduleUpdate);
    }, [values, maxValues, gridColor]);
    const scheduleUpdate = useCallback(async (time: number) => {
        if (time - previousRafTimeRef.current < 1000 / frameRate) {
            rafRef.current = requestAnimationFrame(scheduleUpdate);
            return;
        }
        const absMax = await audioEditor.player?.peakAnalyserNode.getPeakSinceLastGet();
        const newValues = absMax?.length ? absMax.map(atodb) : new Array<number>(audioEditor.numberOfChannels).fill(MIN_DB);
        const maxTimeoutCallback = () => {
            maxTimerRef.current = -1;
            maxValuesRef.current = new Array<number>(audioEditor.numberOfChannels).fill(MIN_DB);
            setMaxValues(maxValuesRef.current);
        };
        if (newValues.find((v, i) => typeof maxValuesRef.current[i] === "undefined" || v > maxValuesRef.current[i])) {
            maxValuesRef.current = newValues.slice();
            setMaxValues(maxValuesRef.current);
            if (maxTimerRef.current !== -1) window.clearTimeout(maxTimerRef.current);
            maxTimerRef.current = window.setTimeout(maxTimeoutCallback, 1000);
        } else if (newValues.find((v, i) => v < maxValuesRef.current[i]) && maxTimerRef.current === -1) {
            maxTimerRef.current = window.setTimeout(maxTimeoutCallback, 1000);
        }
        setValues(values => newValues.length !== values.length || newValues.find((v, i) => v !== values[i]) ? newValues : values);
        rafRef.current = requestAnimationFrame(scheduleUpdate);
    }, [audioEditor]);
    useEffect(() => {
        rafRef.current = requestAnimationFrame(scheduleUpdate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [scheduleUpdate]);
    useEffect(paint, [paint, windowSize]);
    useEffect(paintGrid, [paintGrid, windowSize]);
    const selRowSamples = [selRange?.[0] ?? playhead, selRange?.[1] ?? playhead, selRange ? selRange[1] - selRange[0] : 0];
    const selRowOnChanges = [handleChangeSelRangeStart, handleChangeSelRangeEnd, handleChangeSelRangeDuration];
    const viewRowSamples = [...viewRange, viewRange[1] - viewRange[0]];
    const viewRowOnChanges = [handleChangeViewRangeStart, handleChangeViewRangeEnd, handleChangeViewRangeDuration];
    return (
        <div className="editor-monitor">
            <div className="editor-monitor-meter-container">
                <canvas ref={canvasMeterRef} />
                <canvas ref={canvasGridRef} />
            </div>
            <div className="editor-monitor-ranges">
                <VSCodeDataGrid>
                    <VSCodeDataGridRow rowType={DataGridRowTypes.header}>
                        <VSCodeDataGridCell cell-type="columnheader" grid-column="1"></VSCodeDataGridCell>
                        <VSCodeDataGridCell cell-type="columnheader" grid-column="2">Start</VSCodeDataGridCell>
                        <VSCodeDataGridCell cell-type="columnheader" grid-column="3">End</VSCodeDataGridCell>
                        <VSCodeDataGridCell cell-type="columnheader" grid-column="4">Duration</VSCodeDataGridCell>
                    </VSCodeDataGridRow>
                    <VSCodeDataGridRow>
                        <VSCodeDataGridCell grid-column="1">Selection</VSCodeDataGridCell>
                        {selRowSamples.map((s, i) => (<VSCodeDataGridCell key={`selection-${i}`} grid-column={`${i + 2}`}><TimeInput samples={s} sampleRate={sampleRate} {...configuration} onChange={selRowOnChanges[i]} /></VSCodeDataGridCell>))}
                    </VSCodeDataGridRow>
                    <VSCodeDataGridRow>
                        <VSCodeDataGridCell grid-column="1">View</VSCodeDataGridCell>
                        {viewRowSamples.map((s, i) => (<VSCodeDataGridCell key={`view-${i}`} grid-column={`${i + 2}`}><TimeInput samples={s} sampleRate={sampleRate} {...configuration} onChange={viewRowOnChanges[i]} /></VSCodeDataGridCell>))}
                    </VSCodeDataGridRow>
                </VSCodeDataGrid>
            </div>
        </div>
    );
};

export default AudioEditorMonitor;
