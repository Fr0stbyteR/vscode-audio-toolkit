import "./AudioEditorContainer.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useState } from "react";
import AudioEditorMap from "./AudioEditorMap";
import AudioEditorMain from "./AudioEditorMain";
import AudioEditorControls from "./AudioEditorControls";
import AudioEditorMonitor from "./AudioEditorMonitor";
import { AudioEditorContext } from "./contexts";
import { AudioToolkitModulesState } from "../core/AudioToolkitModule";

interface Props {
}

const AudioEditorContainer: FunctionComponent<Props> = (props: Props) => {
    const audioEditor = useContext(AudioEditorContext)!;
    const [playhead, setPlayhead] = useState(audioEditor.state.playhead);
    const [viewRange, setViewRange] = useState(audioEditor.state.viewRange);
    const [selRange, setSelRange] = useState(audioEditor.state.selRange);
    const [playing, setPlaying] = useState(audioEditor.state.playing);
    const [loop, setLoop] = useState(audioEditor.state.loop);
    const [enabledChannels, setEnabledChannels] = useState(audioEditor.state.enabledChannels);
    const [configuration, setConfiguration] = useState(audioEditor.configuration);
    const [configurationMode, setConfigurationMode] = useState<"analysis" | "appearance">("analysis");
    const [configuring, setConfiguring] = useState(false);
    const [monitoring, setMonitoring] = useState(false);
    const [overlayMode, setOverlayMode] = useState(() => localStorage.getItem("audioToolkit.overlayMode") === "true");
    const [layersOpen, setLayersOpen] = useState(() => localStorage.getItem("audioToolkit.layersOpen") === "true");
    const [windowSize, setWindowSize] = useState([window.innerWidth, window.innerHeight]);
    const [modulesState, setModulesState] = useState<AudioToolkitModulesState>(audioEditor.modulesState);
    const phosphorColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-menu-selectionBackground");
    const playheadColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-editorWarning-foreground");
    const gridColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-menu-separatorBackground");
    const gridRulerColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-menu-foreground");
    const monospaceFont = window.getComputedStyle(document.body).getPropertyValue("--vscode-font-family");
    const textColor = window.getComputedStyle(document.body).getPropertyValue("--vscode-list-highlightForeground");
    const componentProps = {
        playhead,
        viewRange,
        selRange,
        playing,
        loop,
        enabledChannels,
        phosphorColor,
        playheadColor,
        configuration,
        configurationMode,
        configuring,
        monitoring,
        gridColor,
        gridRulerColor,
        labelFont: monospaceFont,
        separatorColor: gridColor,
        fadePathColor: "yellow",
        monospaceFont,
        textColor,
        windowSize,
        visualizersState: modulesState
    };
    const handleWindowUiResized = useCallback(() => {
        audioEditor.emit("uiResized");
    }, [audioEditor]);
    const handleUiResized = useCallback(() => {
        setWindowSize([window.innerWidth, window.innerHeight]);
    }, []);
    const handleModulesState = useCallback((modulesState: AudioToolkitModulesState) => {
        setModulesState((prevModulesState) => {
            if (audioEditor.state.isReady && modulesState.length > prevModulesState.length) setConfiguring(true);
            return modulesState;
        });
    }, [audioEditor]);
    useEffect(() => {
        audioEditor.on("playhead", setPlayhead);
        audioEditor.on("viewRange", setViewRange);
        audioEditor.on("selRange", setSelRange);
        audioEditor.on("playing", setPlaying);
        audioEditor.on("loop", setLoop);
        audioEditor.on("enabledChannels", setEnabledChannels);
        audioEditor.on("configuration", setConfiguration);
        audioEditor.on("uiResized", handleUiResized);
        audioEditor.on("modulesState", handleModulesState);
        window.addEventListener("resize", handleWindowUiResized);
        return () => {
            audioEditor.off("playhead", setPlayhead);
            audioEditor.off("viewRange", setViewRange);
            audioEditor.off("selRange", setSelRange);
            audioEditor.off("playing", setPlaying);
            audioEditor.off("loop", setLoop);
            audioEditor.off("enabledChannels", setEnabledChannels);
            audioEditor.off("configuration", setConfiguration);
            audioEditor.off("uiResized", handleUiResized);
            audioEditor.off("modulesState", handleModulesState);
            window.removeEventListener("resize", handleWindowUiResized);
        };
    }, [audioEditor, handleModulesState, handleUiResized, handleWindowUiResized]);
    useEffect(() => localStorage.setItem("audioToolkit.overlayMode", String(overlayMode)), [overlayMode]);
    useEffect(() => localStorage.setItem("audioToolkit.layersOpen", String(layersOpen)), [layersOpen]);
    return (
        <div className="audio-editor-container">
            <div className="audio-editor-left-container">
                <AudioEditorMap {...componentProps} {...{ setConfiguring, setConfigurationMode, setMonitoring, overlayMode, setOverlayMode, layersOpen, setLayersOpen }} />
                <AudioEditorMain {...componentProps} {...{ overlayMode, layersOpen, setLayersOpen }} />
                <AudioEditorControls {...componentProps} />
                <AudioEditorMonitor {...componentProps} />
            </div>
            <div className="audio-editor-right-container">
            </div>
        </div>
    );
};

export default AudioEditorContainer;
