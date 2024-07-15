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
    const [enabledChannels, setEnabledChannels] = useState(audioEditor.state.enabledChannels);
    const [configuration, setConfiguration] = useState(audioEditor.configuration);
    const phosphorColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-textLink-foreground");
    const cursorColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-minimap-findMatchHighlight");
    const gridColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-menu-separatorBackground");
    const gridLabelColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-menu-foreground");
    const monospaceFont = window.getComputedStyle(document.body).getPropertyValue("--monaco-monospace-font");
    const componentProps = {
        cursor,
        viewRange,
        selRange,
        enabledChannels,
        phosphorColor,
        cursorColor,
        configuration,
        gridColor,
        gridLabelColor,
        monospaceFont
    };
    const handleUiResized = () => audioEditor.emit("uiResized");
    useEffect(() => {
        audioEditor.on("cursor", setCursor);
        audioEditor.on("viewRange", setViewRange);
        audioEditor.on("selRange", setSelRange);
        audioEditor.on("enabledChannels", setEnabledChannels);
        audioEditor.on("configuration", setConfiguration);
        window.addEventListener("resize", handleUiResized);
        return () => {
            audioEditor.off("cursor", setCursor);
            audioEditor.off("viewRange", setViewRange);
            audioEditor.off("selRange", setSelRange);
            audioEditor.off("enabledChannels", setEnabledChannels);
            audioEditor.off("configuration", setConfiguration);
            window.removeEventListener("resize", handleUiResized);
        };
    }, []);
    return (
        <div className="audio-editor-container">
            <div className="audio-editor-left-container">
                <AudioEditorMap {...componentProps} />
                <AudioEditorMain {...componentProps} />
                <AudioEditorControls {...props} />
                <AudioEditorMonitor {...props} />
            </div>
            <div className="audio-editor-right-container">
            </div>
        </div>
    );
};

export default AudioEditorContainer;
