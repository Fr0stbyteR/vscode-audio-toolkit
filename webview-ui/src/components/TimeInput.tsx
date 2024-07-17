import "./TimeInput.scss";
import { FunctionComponent, useCallback, useState } from "react";
import { AudioEditorConfiguration } from "../core/AudioEditor";
import { convertSampleToUnit, convertUnitToSample } from "../utils";

interface Props extends Pick<AudioEditorConfiguration, "audioUnit" | "beatsPerMeasure" | "beatsPerMinute" | "division"> {
    samples: number;
    sampleRate: number;
    style?: React.CSSProperties;
    onChange?: (samples: number) => any;
}
const TimeInput: FunctionComponent<Props> = ({ audioUnit, beatsPerMeasure, beatsPerMinute, division, samples, sampleRate, style, onChange }) => {
    const [editing, setEditing] = useState(false);
    const [dragged, setDragged] = useState(false);
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
        if (editing) return;
        e.stopPropagation();
        e.preventDefault();
        setDragged(false);
        const originX = e.clientX;
        const deltaMultiplier = audioUnit === "measure" ? sampleRate * beatsPerMinute / 60 : sampleRate / 10;
        const handleMouseMove = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            setDragged(true);
            const delta = e.clientX - originX;
            if (e.movementX) onChange?.(samples + delta * deltaMultiplier);
        };
        const handleMouseUp = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [audioUnit, sampleRate, beatsPerMinute, samples, onChange, editing]);
    const handleClick = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
        if (editing) return;
        if (dragged) return;
        const span = e.currentTarget;
        const oldText = span.innerText;
        span.contentEditable = "true";
        setEditing(true);
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(span);
        selection?.removeAllRanges();
        selection?.addRange(range);
        span.focus();
        const handleBlur = async (e?: FocusEvent) => {
            if (e) e.stopPropagation();
            span.removeEventListener("blur", handleBlur);
            span.removeEventListener("keydown", handleKeyDown);
            const newText = span.innerText;
            try {
                const s = Math.round(convertUnitToSample(newText, audioUnit, { sampleRate, beatsPerMinute, beatsPerMeasure, division }));
                onChange?.(s);
            } catch (e) {
                span.innerText = oldText;
            } finally {
                span.contentEditable = "false";
                setEditing(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleBlur();
            }
            if (e.key === "Escape") {
                span.innerText = oldText;
                span.contentEditable = "false";
                setEditing(false);
                span.removeEventListener("blur", handleBlur);
                span.removeEventListener("keydown", handleKeyDown);
                span.blur();
            }
        };
        span.addEventListener("blur", handleBlur);
        span.addEventListener("keydown", handleKeyDown);
    }, [audioUnit, sampleRate, beatsPerMinute, beatsPerMeasure, division, onChange, editing, dragged]);
    return (
        <span className={"time-input" + (editing ? " editing" : "")} onClick={handleClick} onMouseDown={handleMouseDown} style={style}>
            {convertSampleToUnit(samples, audioUnit, { sampleRate, beatsPerMinute, beatsPerMeasure, division }).str}
        </span>
    );
};

export default TimeInput;
