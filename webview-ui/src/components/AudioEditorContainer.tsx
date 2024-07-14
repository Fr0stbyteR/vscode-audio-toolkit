import "./AudioEditorContainer.scss";
import * as vscode from "vscode";
import AudioEditor from "../core/AudioEditor";
import { FunctionComponent, useContext } from "react";
import AudioEditorMap from "./AudioEditorMap";
import AudioEditorMain from "./AudioEditorMain";
import AudioEditorControls from "./AudioEditorControls";
import AudioEditorMonitor from "./AudioEditorMonitor";
import { AudioEditorContext } from "./contexts";

interface Props {
}

const AudioEditorContainer: FunctionComponent<Props> = (props: Props) => {
    const audioEditor = useContext(AudioEditorContext)!;
    return (
        <div className="audio-editor-container">
            <div className="audio-editor-left-container">
                <span>Duration: {audioEditor.duration}s</span>
                <AudioEditorMap {...props} />
                <AudioEditorMain {...props} />
                <AudioEditorControls {...props} />
                <AudioEditorMonitor {...props} />
            </div>
            <div className="audio-editor-right-container">
            </div>
        </div>
    );
};

export default AudioEditorContainer;
