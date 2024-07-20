import "./App.css";
import "@vscode/codicons/dist/codicon.css";
import "@vscode/codicons/dist/codicon.ttf";
import "@vscode/codicons/dist/codicon.svg";
import { vscode } from "./vscode";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import AudioEditor, { AudioEditorConfiguration } from "./core/AudioEditor";
import { AudioEditorContext } from "./components/contexts";
import AudioEditorContainer from "./components/AudioEditorContainer";

const App: FunctionComponent = () => {
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [audioEditor, setAudioEditor] = useState<AudioEditor | null>(null);
    const [ready, setReady] = useState(false);
    const handleInitData = async (data: Uint8Array, configuration: AudioEditorConfiguration, requestId: number) => {
        setFileSize(data.length);
        const audioContext = new AudioContext({ latencyHint: 0.0001 });
        const audioEditor = await AudioEditor.fromData(data.buffer, audioContext, configuration);
        setAudioEditor(audioEditor);
        vscode.postMessage({ type: "response", requestId, body: audioEditor.sampleRate });
    };
    const handleMessage = useCallback((e: MessageEvent<any>): void => {
        const { type, body, requestId } = e.data;
        switch (type) {
            case "init": {
                const data = body.value as Uint8Array;
                const configuration = body.configuration as AudioEditorConfiguration;
                const { fftWindowFunction } = configuration;
                configuration.fftWindowFunction = `${fftWindowFunction.slice(0, 1).toLowerCase()}${fftWindowFunction.slice(1).replaceAll(/[-\s]/g, "")}`;
                handleInitData(data, configuration, requestId);
                window.focus();
                return;
            }
            case "updateConfigurationFromHost": {
                const { audioUnit, fftSize, fftOverlap, fftWindowFunction } = body as AudioEditorConfiguration;
                audioEditor?.setConfiguration({
                    audioUnit,
                    fftSize,
                    fftOverlap,
                    fftWindowFunction: `${fftWindowFunction.slice(0, 1).toLowerCase()}${fftWindowFunction.slice(1).replaceAll(/[-\s]/g, "")}`
                });
                return;
            }
            case "playOrStop": {
                if (!audioEditor) return;
                if (audioEditor.state.playing === "playing") {
                    audioEditor.stop();
                } else {
                    if (audioEditor.context.state === "suspended") audioEditor.context.resume();
                    audioEditor.play();
                }
                return;
            }
            case "pauseOrResume": {
                if (!audioEditor) return;
                if (audioEditor.state.playing === "playing") audioEditor.pause();
                else audioEditor.resume();
                return;
            }
        }
    }, [audioEditor]);
    const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
        if (e.key !== "") return;
        if (!audioEditor) return;
        if (audioEditor.context.state === "suspended" && audioEditor.state.playing !== "playing") {
            await audioEditor.context.resume();
            audioEditor.play();
            window.removeEventListener("keydown", handleKeyDown);
        }
    }, [audioEditor]);
    useEffect(() => {
        window.addEventListener("message", handleMessage);
        window.addEventListener("keydown", handleKeyDown);
        if (!ready) {
            setReady(true);
            vscode.postMessage({ type: "ready" });
        }
        return () => {
            window.removeEventListener("message", handleMessage);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [handleMessage, handleKeyDown, ready]);
    return (
        <main>
            {audioEditor ? (
                <AudioEditorContext.Provider value={audioEditor}>
                    <AudioEditorContainer></AudioEditorContainer>
                </AudioEditorContext.Provider>
            ) : <VSCodeProgressRing></VSCodeProgressRing>}
        </main>
    );
};

export default App;
