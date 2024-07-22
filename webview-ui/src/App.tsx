import "./App.css";
import "@vscode/codicons/dist/codicon.css";
import "@vscode/codicons/dist/codicon.ttf";
import "@vscode/codicons/dist/codicon.svg";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useEffect, useState } from "react";
import AudioEditor from "./core/AudioEditor";
import { AudioEditorContext, AudioEditorWebviewContext } from "./components/contexts";
import AudioEditorContainer from "./components/AudioEditorContainer";
import AudioEditorWebview from "./AudioEditorWebview";

let isReady = false;

const App: FunctionComponent = () => {
    const [audioEditor, setAudioEditor] = useState<AudioEditor | null>(null);
    const [audioEditorWebview, setAudioEditorWebview] = useState<AudioEditorWebview | null>(null);
    useEffect(() => {
        const audioEditorWebview = new AudioEditorWebview();
        audioEditorWebview.attachReact(setAudioEditor);
        setAudioEditorWebview(audioEditorWebview);
        if (!isReady) {
            audioEditorWebview.ready();
            isReady = true;
        }
        return () => audioEditorWebview.dispose();
    }, []);
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
