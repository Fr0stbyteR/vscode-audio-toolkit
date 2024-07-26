import "./AudioEditorControls.scss";
import { FunctionComponent, useCallback, useContext, useState } from "react";
import { AudioEditorContext } from "./contexts";
import { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";
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
    const handleAddModuleInput = (e: React.FormEvent<HTMLInputElement>) => {
        audioEditor.addModule(e.currentTarget.value);
    };
    return (
        <div className="editor-main-controls">
            <span className="editor-main-player-controls-container">
                <span className="editor-main-player-controls">
                    <VSCodeButton tabIndex={-1} title="Stop" disabled={playing === "stopped"} appearance="icon" onClick={handleClickStop}>
                        <span className="codicon codicon-debug-stop"></span>
                    </VSCodeButton>
                    <VSCodeButton tabIndex={-1} title="Play" appearance="icon" onClick={handleClickPlay}>
                        <span className="codicon codicon-play"></span>
                    </VSCodeButton>
                    <VSCodeButton tabIndex={-1} title="Pause" appearance="icon" disabled={playing === "stopped"} onClick={handleClickPause}>
                        {playing === "paused" ? <span className="codicon codicon-debug-continue-small"></span> : <span className="codicon codicon-debug-pause"></span>}
                    </VSCodeButton>
                    <VSCodeButton tabIndex={-1} title="Loop" appearance="icon" className={loop ? "active" : ""} onClick={handleClickLoop}>
                        <span className="codicon codicon-refresh"></span>
                    </VSCodeButton>
                </span>
            </span>
            <span className="editor-add-component">
                <VSCodeDropdown className="editor-add-component-dropdown" value="none" onInput={handleAddModuleInput}>
                <   VSCodeOption value="none">Add a Module</VSCodeOption>
                    {
                        Object.keys(audioEditor.modulesMap).map(k => <VSCodeOption value={k}>{audioEditor.modulesMap[k].MODULE_NAME}</VSCodeOption>)
                    }
                </VSCodeDropdown>
            </span>
            <TimeInput samples={playhead} sampleRate={sampleRate} {...configuration} onChange={handlePlayheadChanged} />
        </div>
    );
};

export default AudioEditorControls;
