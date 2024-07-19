import "./AudioEditorControls.scss";
import { FunctionComponent, useCallback, useContext, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import TimeInput from "./TimeInput";

interface Props extends Pick<AudioEditorState, "playing" | "playhead" | "loop"> {
    configuration: AudioEditorConfiguration;
}

const AudioEditorControls: FunctionComponent<Props> = ({ playhead, playing, loop, configuration }) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const handlePlayheadChanged = (playhead: number) => audioEditor.setPlayhead(playhead);
    const [playheadBeforePlay, setPlayheadBeforePlay] = useState(playhead);
    const handleClickPlay = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        if (audioEditor.context.state === "suspended") audioEditor.context.resume();
        if (playing === "playing") {
            audioEditor.setPlayhead(playheadBeforePlay);
            audioEditor.play();
        } else {
            setPlayheadBeforePlay(playhead);
            if (playing === "paused") audioEditor.resume();
            else audioEditor.play();
        }
    }, [audioEditor, playing, playheadBeforePlay, playhead]);
    const handleClickStop = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        audioEditor.stop();
    }, [audioEditor]);
    const handleClickPause = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        if (playing === "paused") audioEditor.resume();
        else audioEditor.pause();
    }, [audioEditor, playing]);
    const handleClickLoop = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        audioEditor.setLoop(!loop);
    }, [audioEditor, loop]);
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
            <TimeInput samples={playhead} sampleRate={sampleRate} {...configuration} onChange={handlePlayheadChanged} />
        </div>
    );
};

export default AudioEditorControls;
