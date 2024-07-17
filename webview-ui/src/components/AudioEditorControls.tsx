import "./AudioEditorControls.scss";
import { FunctionComponent, useCallback, useContext, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import TimeInput from "./TimeInput";

interface Props extends Pick<AudioEditorState, "playing" | "cursor" | "loop"> {
    configuration: AudioEditorConfiguration;
}

const AudioEditorControls: FunctionComponent<Props> = ({ cursor, playing, loop, configuration }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const handleCursorChanged = (cursor: number) => audioEditor.setCursor(cursor);
    const [cursorBeforePlay, setCursorBeforePlay] = useState(cursor);
    const handleClickPlay = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        if (audioEditor.context.state === "suspended") audioEditor.context.resume();
        if (playing === "playing") {
            audioEditor.setCursor(cursorBeforePlay);
            audioEditor.play();
        } else {
            setCursorBeforePlay(cursor);
            if (playing === "paused") audioEditor.resume();
            else audioEditor.play();
        }
    }, [cursor, playing, cursorBeforePlay]);
    const handleClickStop = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        audioEditor.stop();
    }, []);
    const handleClickPause = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        if (playing === "paused") audioEditor.resume();
        else audioEditor.pause();
    }, [playing]);
    const handleClickLoop = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        audioEditor.setLoop(!loop);
    }, [loop]);
    const { sampleRate } = audioEditor;
    return (
        <div className="editor-main-controls">
            <span className="editor-main-player-controls-container">
                <span className="editor-main-player-controls">
                    <VSCodeButton title="Stop" disabled={playing === "stopped"} appearance="icon" onClick={handleClickStop}>
                        <span className="codicon codicon-debug-stop"></span>
                    </VSCodeButton>
                    <VSCodeButton title="Play" appearance="icon" onClick={handleClickPlay}>
                        <span className="codicon codicon-play"></span>
                    </VSCodeButton>
                    <VSCodeButton title="Pause" appearance="icon" disabled={playing === "stopped"} onClick={handleClickPause}>
                        {playing === "paused" ? <span className="codicon codicon-debug-continue-small"></span> : <span className="codicon codicon-debug-pause"></span>}
                    </VSCodeButton>
                    <VSCodeButton title="Loop" appearance="icon" className={loop ? "active" : ""} onClick={handleClickLoop}>
                        <span className="codicon codicon-refresh"></span>
                    </VSCodeButton>
                </span>
            </span>
            <TimeInput samples={cursor} sampleRate={sampleRate} {...configuration} onChange={handleCursorChanged} />
        </div>
    );
};

export default AudioEditorControls;
