import "./AudioEditorContainer.scss";
import { FunctionComponent, useContext, useEffect, useState } from "react";
import AudioEditorMap from "./AudioEditorMap";
import AudioEditorMain from "./AudioEditorMain";
import AudioEditorControls from "./AudioEditorControls";
import AudioEditorMonitor from "./AudioEditorMonitor";
import { AudioEditorContext } from "./contexts";

interface Props {
}

const AudioEditorContainer: FunctionComponent<Props> = (props: Props) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const [cursor, setCursor] = useState(audioEditor.state.cursor);
    const [viewRange, setViewRange] = useState(audioEditor.state.viewRange);
    const [selRange, setSelRange] = useState(audioEditor.state.selRange);
    const phosphorColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-textLink-foreground");
    const cursorColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-minimap-findMatchHighlight");
    const componentProps = {
        cursor,
        viewRange,
        selRange,
        phosphorColor,
        cursorColor
    };
    const handleUiResized = () => audioEditor.emit("uiResized");
    useEffect(() => {
        audioEditor.on("cursor", setCursor);
        audioEditor.on("viewRange", setViewRange);
        audioEditor.on("selRange", setSelRange);
        window.addEventListener("resize", handleUiResized);
        return () => {
            audioEditor.off("cursor", setCursor);
            audioEditor.off("viewRange", setViewRange);
            audioEditor.off("selRange", setSelRange);
            window.removeEventListener("resize", handleUiResized);
        };
    }, []);
    return (
        <div className="audio-editor-container">
            <div className="audio-editor-left-container">
                <span>Duration: {audioEditor.duration}s</span>
                <AudioEditorMap {...componentProps} />
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
