import "./App.css";
import "@vscode/codicons/dist/codicon.css";
import "@vscode/codicons/dist/codicon.ttf";
import "@vscode/codicons/dist/codicon.svg";
import { vscode } from "./utilities/vscode";
import { VSCodeButton, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useEffect, useState } from "react";
import AudioEditor, { AudioEditorConfiguration } from "./core/AudioEditor";
import { AudioEditorContext } from "./components/contexts";
import AudioEditorContainer from "./components/AudioEditorContainer";


const handleHowdyClick = () => {
    vscode.postMessage({
        type: "hello",
        text: "Hey there partner! 🤠",
    });
};

const App: FunctionComponent = () => {
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [audioEditor, setAudioEditor] = useState<AudioEditor | null>(null);
    useEffect(() => {
        const handleInitData = async (data: Uint8Array, configuration: AudioEditorConfiguration) => {
            setFileSize(data.length);
            const audioContext = new AudioContext({ latencyHint: 0.0001 });
            const audioEditor = await AudioEditor.fromData(data.buffer, audioContext, configuration);
            setAudioEditor(audioEditor);
        };
        window.addEventListener("message", (e) => {
            const { type, body, requestId } = e.data;
            switch (type) {
                case "init":
                    {
                        const data = body.value as Uint8Array;
                        const configuration = body.configuration as AudioEditorConfiguration;
                        handleInitData(data, configuration);
                        return;
                    }
                case "updateConfigurationFromHost":
                    {
                        const { audioUnit, fftSize, fftOverlap, fftWindowFunction } = body as AudioEditorConfiguration;
                        audioEditor?.setConfiguration({
                            audioUnit,
                            fftSize,
                            fftOverlap,
                            fftWindowFunction: `${fftWindowFunction.slice(0, 1).toLowerCase()}${fftWindowFunction.slice(1).replaceAll(/[-\s]/g, "")}`
                        })
                        return;
                    }
                case "getFileData":
                    {
                        return;
                    }
            }
        });
        vscode.postMessage({ type: "ready" });
    }, []);
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
