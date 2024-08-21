import "./App.css";
import "@vscode/codicons/dist/codicon.css";
import "@vscode/codicons/dist/codicon.ttf";
import "@vscode/codicons/dist/codicon.svg";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import AudioEditor, { AudioEditorConfiguration } from "./core/AudioEditor";
import { AudioEditorContext, AudioEditorWebviewContext } from "./components/contexts";
import AudioEditorContainer from "./components/AudioEditorContainer";
import AudioEditorWebview from "./AudioEditorWebview";
import { AudioToolkitModulesState } from "./core/AudioToolkitModule";

let isReady = false;

const App: FunctionComponent = () => {
    const [audioEditor, setAudioEditor] = useState<AudioEditor | null>(null);
    const [audioEditorWebview, setAudioEditorWebview] = useState<AudioEditorWebview | null>(null);
    const initCallback = useCallback(async (webview: AudioEditorWebview, { data, uri, editable, workspaceUri }: { data?: Uint8Array; uri?: string; editable?: boolean; workspaceUri?: string }, configuration: AudioEditorConfiguration, modulesState: AudioToolkitModulesState | null = webview.getState()) => {
        const { fftWindowFunction } = configuration;
        configuration.fftWindowFunction = `${fftWindowFunction.slice(0, 1).toLowerCase()}${fftWindowFunction.slice(1).replaceAll(/[-\s]/g, "")}`;
        let arrayBuffer: ArrayBuffer | undefined;
        if (data) {
            arrayBuffer = data.buffer;
        } else if (typeof uri === "string") {
            const response = await fetch(uri);
            arrayBuffer = await response.arrayBuffer();
        }
        if (!arrayBuffer) throw new Error(`Cannot resolve data from ${uri} or data input`);
        const audioContext = new AudioContext({ latencyHint: 0.0001 });
        const audioEditor = await AudioEditor.fromData(arrayBuffer, audioContext, configuration, modulesState ?? undefined, uri, workspaceUri);
        webview.audioEditor = audioEditor;
        setAudioEditor!(audioEditor);
        audioEditor.on("modulesState", ((state) => {
            webview.setState(state);
            if (!audioEditor?.makingEdit) return;
            webview.makeEditModulesState({ modulesState: state });
        }));
        window.focus();
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.key !== " ") return;
            e.preventDefault();
            if (!audioEditor) return;
            if (audioEditor.context.state === "suspended" && audioEditor.state.playing !== "playing") {
                await audioEditor.context.resume();
                audioEditor.play();
                // window.removeEventListener("keydown", handleKeyDown);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return audioEditor.sampleRate;
    }, []);
    useEffect(() => {
        const audioEditorWebview = new AudioEditorWebview(initCallback);
        setAudioEditorWebview(audioEditorWebview);
        if (!isReady) {
            audioEditorWebview.ready();
            isReady = true;
        }
        return () => audioEditorWebview.dispose();
    }, [initCallback]);
    return (
        <main>
            {audioEditor && audioEditorWebview ? (
                <AudioEditorContext.Provider value={audioEditor}>
                <AudioEditorWebviewContext.Provider value={audioEditorWebview}>
                    <AudioEditorContainer></AudioEditorContainer>
                </AudioEditorWebviewContext.Provider>
                </AudioEditorContext.Provider>
            ) : <VSCodeProgressRing></VSCodeProgressRing>}
        </main>
    );
};

export default App;
