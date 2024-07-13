import "./App.css";
import { vscode } from "./utilities/vscode";
import { VSCodeButton, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useEffect, useState } from "react";
import AudioEditor from "./core/AudioEditor";
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
        const handleInitData = async (data: Uint8Array) => {
            setFileSize(data.length);
            const audioContext = new AudioContext({ latencyHint: 0.0001 });
            const audioEditor = await AudioEditor.fromData(data.buffer, audioContext);
            setAudioEditor(audioEditor);
        };
        window.addEventListener("message", (e) => {
            const { type, body, requestId } = e.data;
            switch (type) {
                case "init":
                    {
                        const data: Uint8Array = body.value;
                        handleInitData(data);
                    }
                case "update":
                    {
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
            <h1>Hello World!</h1>
            <VSCodeButton onClick={handleHowdyClick}>Howdy!</VSCodeButton>
            {fileSize ? <span>File Size1: {fileSize}</span> : null}
            {audioEditor ? (
                <AudioEditorContext.Provider value={audioEditor}>
                    <AudioEditorContainer></AudioEditorContainer>
                </AudioEditorContext.Provider>
            ) : <VSCodeProgressRing></VSCodeProgressRing>}
        </main>
    );
};

export default App;
