import "./AudioEditorContainer.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useState } from "react";
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
    const [playing, setPlaying] = useState(audioEditor.state.playing);
    const [loop, setLoop] = useState(audioEditor.state.loop);
    const [enabledChannels, setEnabledChannels] = useState(audioEditor.state.enabledChannels);
    const [configuration, setConfiguration] = useState(audioEditor.configuration);
    const [windowSize, setWindowSize] = useState([window.innerWidth, window.innerHeight]);
    const phosphorColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-menu-selectionBackground");
    const cursorColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-minimap-findMatchHighlight");
    const gridColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-menu-separatorBackground");
    const gridRulerColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-menu-foreground");
    const monospaceFont = window.getComputedStyle(document.body).getPropertyValue("--vscode-font-family");
    const textColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-list-highlightForeground");
    const componentProps = {
        cursor,
        viewRange,
        selRange,
        playing,
        loop,
        enabledChannels,
        phosphorColor,
        cursorColor,
        configuration,
        gridColor,
        gridRulerColor,
        monospaceFont,
        textColor,
        windowSize
    };
    const handleWindowUiResized = useCallback(() => {
        audioEditor.emit("uiResized");
    }, []);
    const handleUiResized = useCallback(() => {
        setWindowSize([window.innerWidth, window.innerHeight]);
    }, []);
    useEffect(() => {
        audioEditor.on("cursor", setCursor);
        audioEditor.on("viewRange", setViewRange);
        audioEditor.on("selRange", setSelRange);
        audioEditor.on("playing", setPlaying);
        audioEditor.on("loop", setLoop);
        audioEditor.on("enabledChannels", setEnabledChannels);
        audioEditor.on("configuration", setConfiguration);
        audioEditor.on("uiResized", handleUiResized);
        window.addEventListener("resize", handleWindowUiResized);
        return () => {
            audioEditor.off("cursor", setCursor);
            audioEditor.off("viewRange", setViewRange);
            audioEditor.off("selRange", setSelRange);
            audioEditor.off("playing", setPlaying);
            audioEditor.off("loop", setLoop);
            audioEditor.off("enabledChannels", setEnabledChannels);
            audioEditor.off("configuration", setConfiguration);
            audioEditor.off("uiResized", handleUiResized);
            window.removeEventListener("resize", handleWindowUiResized);
        };
    }, []);
    return (
        <div className="audio-editor-container">
            <div className="audio-editor-left-container">
                <AudioEditorMap {...componentProps} />
                <AudioEditorMain {...componentProps} />
                <AudioEditorControls {...componentProps} />
                <AudioEditorMonitor {...componentProps} />
            </div>
            <div className="audio-editor-right-container">
            </div>
        </div>
    );
};

export default AudioEditorContainer;
