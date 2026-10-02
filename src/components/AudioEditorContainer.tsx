import "./AudioEditorContainer.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useState } from "react";
import AudioEditorMap from "./AudioEditorMap";
import AudioEditorMain from "./AudioEditorMain";
import AudioEditorControls from "./AudioEditorControls";
import AudioEditorMonitor from "./AudioEditorMonitor";
import { AudioEditorContext } from "./contexts";
import { AudioToolkitModulesState } from "../core/AudioToolkitModule";
import { useLocale } from "../i18n/LocaleContext";
import CollapsiblePanel from "./CollapsiblePanel";
import MusicMetadataPanel from "./MusicMetadataPanel";

interface Props {
    standalone?: boolean;
    onResetAudio?: () => void;
}

const AudioEditorContainer: FunctionComponent<Props> = (props: Props) => {
    const { t } = useLocale();
    const audioEditor = useContext(AudioEditorContext)!;
    const [playhead, setPlayhead] = useState(audioEditor.state.playhead);
    const [viewRange, setViewRange] = useState(audioEditor.state.viewRange);
    const [selRange, setSelRange] = useState(audioEditor.state.selRange);
    const [playing, setPlaying] = useState(audioEditor.state.playing);
    const [loop, setLoop] = useState(audioEditor.state.loop);
    const [enabledChannels, setEnabledChannels] = useState(audioEditor.state.enabledChannels);
    const [configuration, setConfiguration] = useState(audioEditor.configuration);
    const [configurationMode, setConfigurationMode] = useState<"analysis" | "appearance" | "both">("analysis");
    const [configuring, setConfiguring] = useState(false);
    const [monitoring, setMonitoring] = useState(false);
    const [overlayMode, setOverlayMode] = useState(() => localStorage.getItem("audioToolkit.overlayMode") === "true");
    const [layersOpen, setLayersOpen] = useState(() => props.standalone
        ? localStorage.getItem("audioToolkit.layersExpanded") !== "false"
        : localStorage.getItem("audioToolkit.layersOpen") === "true");
    const [windowSize, setWindowSize] = useState([window.innerWidth, window.innerHeight]);
    const [modulesState, setModulesState] = useState<AudioToolkitModulesState>(audioEditor.modulesState);
    const [activeLayerIndex, setActiveLayerIndex] = useState(Math.max(1, audioEditor.modulesState.length - 1));
    const hasInspector = !!props.standalone;
    const [inspectorReady, setInspectorReady] = useState(!hasInspector);
    useEffect(() => { if (hasInspector) setInspectorReady(true); }, [hasInspector]);
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
        configurationMode: hasInspector ? "both" as const : configurationMode,
        configuring: hasInspector ? false : configuring,
        monitoring: hasInspector ? true : monitoring,
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
            if (audioEditor.state.isReady && modulesState.length > prevModulesState.length) {
                setActiveLayerIndex(modulesState.length - 1);
                if (!hasInspector) setConfiguring(true);
            }
            return modulesState;
        });
    }, [audioEditor, hasInspector]);
    useEffect(() => {
        audioEditor.on("playhead", setPlayhead);
        audioEditor.on("focusModule", setActiveLayerIndex);
        audioEditor.on("viewRange", setViewRange);
        audioEditor.on("selRange", setSelRange);
        audioEditor.on("playing", setPlaying);
        audioEditor.on("loop", setLoop);
        audioEditor.on("enabledChannels", setEnabledChannels);
        audioEditor.on("configuration", setConfiguration);
        // Child controls can restore preferences before this parent subscribes.
        setConfiguration(audioEditor.configuration);
        audioEditor.on("uiResized", handleUiResized);
        audioEditor.on("modulesState", handleModulesState);
        window.addEventListener("resize", handleWindowUiResized);
        return () => {
            audioEditor.off("playhead", setPlayhead);
            audioEditor.off("focusModule", setActiveLayerIndex);
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
    useEffect(() => localStorage.setItem(hasInspector ? "audioToolkit.layersExpanded" : "audioToolkit.layersOpen", String(layersOpen)), [hasInspector, layersOpen]);
    return (
        <div className="audio-editor-container">
            <div className="audio-editor-left-container">
                <AudioEditorMap {...componentProps} {...{ setConfiguring, setConfigurationMode, setMonitoring, overlayMode, setOverlayMode, layersOpen, setLayersOpen }} standalone={hasInspector} />
                {inspectorReady ? <AudioEditorMain {...componentProps} {...{ overlayMode, setOverlayMode, layersOpen, setLayersOpen, activeLayerIndex, setActiveLayerIndex }} onResetAudio={props.onResetAudio} /> : null}
                <AudioEditorControls {...componentProps} />
                <AudioEditorMonitor {...componentProps} />
            </div>
            <div className="audio-editor-right-container">
                {hasInspector ? <>
                    <header className="inspector-header"><span>{t("INSPECTOR")}</span><strong>{t(modulesState[activeLayerIndex]?.moduleName ?? "Select a layer")}</strong></header>
                    <CollapsiblePanel id="data" title="Data" icon="info" className="inspector-section"><div id="inspector-data" /></CollapsiblePanel>
                    <CollapsiblePanel id="analysis" title="Analysis" icon="beaker" className="inspector-section"><div id="inspector-analysis" /></CollapsiblePanel>
                    <CollapsiblePanel id="appearance" title="Appearance" icon="paintcan" className="inspector-section"><div id="inspector-appearance" /></CollapsiblePanel>
                    <MusicMetadataPanel />
                    <div id="inspector-config-root" hidden />
                </> : null}
            </div>
        </div>
    );
};

export default AudioEditorContainer;
