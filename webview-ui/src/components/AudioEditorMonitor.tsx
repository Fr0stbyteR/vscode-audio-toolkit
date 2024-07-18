import "./AudioEditorMonitor.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react";
import { DataGridRowTypes } from "@vscode/webview-ui-toolkit";
import TimeInput from "./TimeInput";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { WaveformPaintOptions } from "../core/Waveform";
import { atodb, setCanvasToFullSize } from "../utils";

interface Props extends Pick<AudioEditorState, "cursor" | "selRange" | "viewRange">, Pick<WaveformPaintOptions, "gridRulerColor" | "textColor"> {
    monospaceFont: string;
    configuration: AudioEditorConfiguration;
}

const AudioEditorMonitor: FunctionComponent<Props> = ({ cursor, selRange, viewRange, gridRulerColor, textColor, monospaceFont, configuration }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const [values, setValues] = useState<number[]>([]);
    const [maxValues, setMaxValues] = useState<number[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const bgColor = "rgb(40, 40, 40)";
        const coldColor = "rgb(12, 248, 100)";
        const warmColor = "rgb(195, 248, 100)";
        const hotColor = "rgb(255, 193, 10)";
        const overloadColor = "rgb(255, 10, 10)";

        const [width, height] = setCanvasToFullSize(canvas);

        ctx.clearRect(0, 0, width, height);
        if (width <= 0 || height <= 0) return;
        const channels = values.length;
        const clipValue = 0;
        const bottom = 20;
        const $height = (height - bottom - channels - 1) / channels;
        ctx.fillStyle = bgColor;
        if (min >= clipValue || clipValue >= max) {
            const fgColor = min >= clipValue ? overloadColor : coldColor;
            let $top = 0;
            values.forEach((v) => {
                if (v < max) ctx.fillRect(0, $top, width, $height);
                $top += $height + 1;
            });
            $top = 0;
            ctx.fillStyle = fgColor;
            values.forEach((v, i) => {
                const distance = Math.max(0, Math.min(1, (v - min) / (max - min)));
                if (distance > 0) ctx.fillRect(0, $top, distance * width, $height);
                const histMax = maxValues[i];
                if (typeof histMax === "number" && histMax > v) {
                    const histDistance = Math.max(0, Math.min(1, (histMax - min) / (max - min)));
                    ctx.fillRect(Math.min(width - 1, histDistance * width), $top, 1, $height);
                }
                $top += $height + 1;
            });
        } else {
            const clipDistance = Math.max(0, Math.min(1, (clipValue - min) / (max - min)));
            const clip = width - clipDistance * width;
            const hotStop = width - clip;
            const warmStop = hotStop - 1;
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, coldColor);
            gradient.addColorStop(warmStop / width, warmColor);
            gradient.addColorStop(hotStop / width, hotColor);
            gradient.addColorStop(1, overloadColor);
            let $top = 0;
            values.forEach((v) => {
                if (v < clipValue) ctx.fillRect(0, $top, warmStop, $height);
                if (v < max) ctx.fillRect(hotStop, $top, clip, $height);
                $top += $height + 1;
            });
            $top = 0;
            ctx.fillStyle = gradient;
            values.forEach((v, i) => {
                const distance = Math.max(0, Math.min(1, (v - min) / (max - min)));
                if (distance > 0) ctx.fillRect(0, $top, Math.min(warmStop, distance * width), $height);
                if (distance > clipDistance) ctx.fillRect(hotStop, $top, Math.min(clip, (distance - clipDistance) * width), $height);
                const histMax = maxValues[i];
                if (typeof histMax === "number" && histMax > v) {
                    const histDistance = Math.max(0, Math.min(1, (histMax - min) / (max - min)));
                    if (histDistance <= clipDistance) ctx.fillRect(histDistance * width, $top, 1, $height);
                    else ctx.fillRect(Math.min(width - 1, histDistance * width), $top, 1, $height);
                }
                $top += $height + 1;
            });
            ctx.strokeStyle = gridRulerColor;
            ctx.fillStyle = textColor;
            ctx.font = `12px ${monospaceFont}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText("dB", 10, height - bottom + 6);
            ctx.beginPath();
            for (let db = -60; db <= 5; db += (width > 250 ? 1 : width > 100 ? 3 : 12)) {
                const x = (db - min) / (max - min) * width;
                ctx.moveTo(x, height - bottom - 2);
                ctx.lineTo(x, height - bottom + (db % 6 === 0 ? 4 : 2));
                if (db % (width > 250 ? 6 : width > 100 ? 12 : 36) === 0) ctx.fillText(db.toString(), x, height - bottom + 6);
            }
            ctx.stroke();
        }
        // if (audioEditor.state.playing === "playing") schedulePaint();
        // rafRef.current = requestAnimationFrame(scheduleUpdate);
    }, [values, maxValues, gridRulerColor, textColor, monospaceFont]);
    const scheduleUpdate = useCallback(async (time: number) => {
        if (time - previousRafTimeRef.current < 1000 / frameRate) {
            rafRef.current = requestAnimationFrame(scheduleUpdate);
            return;
        }
        const absMax = await audioEditor.player?.peakAnalyserNode.getPeakSinceLastGet() ?? new Array(audioEditor.numberOfChannels).fill(0);
        const values = absMax.length ? absMax.map(atodb) : [min];
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
    const selRowSamples = [selRange?.[0] ?? cursor, selRange?.[1] ?? cursor, selRange ? selRange[1] - selRange[0] : 0];
    const selRowOnChanges = [handleChangeSelRangeStart, handleChangeSelRangeEnd, handleChangeSelRangeDuration];
    const viewRowSamples = [...viewRange, viewRange[1] - viewRange[0]];
    const viewRowOnChanges = [handleChangeViewRangeStart, handleChangeViewRangeEnd, handleChangeViewRangeDuration];
    return (
        <div className="editor-monitor">
            <div className="editor-monitor-meter-container">
                <canvas ref={canvasRef} />
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
