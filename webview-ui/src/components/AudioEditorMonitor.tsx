import "./AudioEditorMonitor.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react";
import { DataGridRowTypes } from "@vscode/webview-ui-toolkit";
import TimeInput from "./TimeInput";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { WaveformPaintOptions } from "../core/Waveform";
import { atodb, setCanvasToFullSize } from "../utils";

interface Props extends Pick<AudioEditorState, "cursor" | "selRange" | "viewRange">, Pick<WaveformPaintOptions, "gridRulerColor" | "gridColor" | "textColor"> {
    monospaceFont: string;
    configuration: AudioEditorConfiguration;
    windowSize: number[];
}

const AudioEditorMonitor: FunctionComponent<Props> = ({ cursor, selRange, viewRange, gridRulerColor, gridColor, textColor, monospaceFont, configuration, windowSize }) => {
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
        else audioEditor.setCursor(samples);
    }, [selRange]);
    const handleChangeSelRangeEnd = useCallback((samples: number) => {
        if (selRange) audioEditor.setSelRange([selRange[0], samples]);
        else audioEditor.setSelRange([cursor, samples]);
    }, [cursor, selRange]);
    const handleChangeSelRangeDuration = useCallback((samples: number) => {
        if (selRange) audioEditor.setSelRange([selRange[0], selRange[0] + samples]);
        else audioEditor.setSelRange([cursor, cursor + samples]);
    }, [cursor, selRange]);
    const handleChangeViewRangeStart = useCallback((samples: number) => {
        audioEditor.setViewRange([samples, viewRange[1]]);
    }, [viewRange]);
    const handleChangeViewRangeEnd = useCallback((samples: number) => {
        audioEditor.setViewRange([viewRange[0], samples]);
    }, [viewRange]);
    const handleChangeViewRangeDuration = useCallback((samples: number) => {
        audioEditor.setViewRange([viewRange[0], viewRange[0] + samples]);
    }, [viewRange]);
    const frameRate = 60;
    const min = -70;
    const max = 6;
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
            x = (db - min) / (max - min) * width;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, db % 6 === 0 ? 4 : 2);
            if (db % (width > 250 ? 6 : width > 100 ? 12 : 36) === 0) ctx.fillText(db.toString(), x, 6);
        }
        ctx.stroke();
    }, [windowSize, gridRulerColor, monospaceFont, textColor]);
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
        if (min >= clipValue || clipValue >= max) {
            const fgColor = min >= clipValue ? overloadColor : coldColor;
            ctx.fillStyle = fgColor;
            for (let channel = 0; channel < channels; channel++) {
                v = values[channel];
                x = Math.max(0, Math.min(1, (v - min) / (max - min))) * width;
                if (x > 0) ctx.fillRect(0, y, x, channelHeight);
                histMax = maxValues[channel];
                if (typeof histMax === "number" && histMax > v) {
                    x = Math.max(0, Math.min(1, (histMax - min) / (max - min))) * width;
                    ctx.fillRect(Math.min(width - 1, x), y, 1, channelHeight);
                }
                y += channelHeight + 1;
            }
        } else {
            const clipX = Math.max(0, Math.min(1, (clipValue - min) / (max - min))) * width;
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
                x = Math.max(0, Math.min(1, (v - min) / (max - min))) * width;
                if (x > 0) ctx.fillRect(0, y, Math.min(warmStop, x), channelHeight);
                if (x > clipX) ctx.fillRect(hotStop, y, Math.min(clipWidth, x - clipX), channelHeight);
                histMax = maxValues[channel];
                if (typeof histMax === "number" && histMax > v) {
                    x = Math.max(0, Math.min(1, (histMax - min) / (max - min)));
                    if (x <= clipX) ctx.fillRect(x, y, 1, channelHeight);
                    else ctx.fillRect(Math.min(width - 1, x), y, 1, channelHeight);
                }
                y += channelHeight + 1;
            }
        }
        // if (audioEditor.state.playing === "playing") schedulePaint();
        // rafRef.current = requestAnimationFrame(scheduleUpdate);
    }, [windowSize, values, maxValues, gridColor]);
    const scheduleUpdate = useCallback(async (time: number) => {
        if (time - previousRafTimeRef.current < 1000 / frameRate) {
            rafRef.current = requestAnimationFrame(scheduleUpdate);
            return;
        }
        const absMax = await audioEditor.player?.peakAnalyserNode.getPeakSinceLastGet();
        const values = absMax?.length ? absMax.map(atodb) : new Array(audioEditor.numberOfChannels).fill(min) as number[];
        const maxTimeoutCallback = () => {
            maxTimerRef.current = -1;
            maxValuesRef.current = [];
            setMaxValues(maxValuesRef.current);
        };
        if (values.find((v, i) => typeof maxValuesRef.current[i] === "undefined" || v > maxValuesRef.current[i])) {
            maxValuesRef.current = values.slice();
            setMaxValues(maxValuesRef.current);
            if (maxTimerRef.current !== -1) window.clearTimeout(maxTimerRef.current);
            maxTimerRef.current = window.setTimeout(maxTimeoutCallback, 1000);
        } else if (values.find((v, i) => v < maxValuesRef.current[i]) && maxTimerRef.current === -1) {
            maxTimerRef.current = window.setTimeout(maxTimeoutCallback, 1000);
        }
        setValues(values); 
        rafRef.current = requestAnimationFrame(scheduleUpdate);
    }, []);
    useEffect(() => {
        rafRef.current = requestAnimationFrame(scheduleUpdate);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);
    useEffect(paint, [paint]);
    useEffect(paintGrid, [paintGrid]);
    const selRowSamples = [selRange?.[0] ?? cursor, selRange?.[1] ?? cursor, selRange ? selRange[1] - selRange[0] : 0];
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
                        {selRowSamples.map((s, i) => (<VSCodeDataGridCell grid-column={`${i + 2}`}><TimeInput samples={s} sampleRate={sampleRate} {...configuration} onChange={selRowOnChanges[i]} /></VSCodeDataGridCell>))}
                    </VSCodeDataGridRow>
                    <VSCodeDataGridRow>
                        <VSCodeDataGridCell grid-column="1">View</VSCodeDataGridCell>
                        {viewRowSamples.map((s, i) => (<VSCodeDataGridCell grid-column={`${i + 2}`}><TimeInput samples={s} sampleRate={sampleRate} {...configuration} onChange={viewRowOnChanges[i]} /></VSCodeDataGridCell>))}
                    </VSCodeDataGridRow>
                </VSCodeDataGrid>
            </div>
        </div>
    );
};

export default AudioEditorMonitor;
