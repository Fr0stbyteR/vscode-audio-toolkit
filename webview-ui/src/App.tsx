import "./App.css";
import "@vscode/codicons/dist/codicon.css";
import "@vscode/codicons/dist/codicon.ttf";
import "@vscode/codicons/dist/codicon.svg";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import AudioEditor, { AudioEditorConfiguration } from "./core/AudioEditor";
import { AudioEditorContext } from "./components/contexts";
import AudioEditorContainer from "./components/AudioEditorContainer";
import VSCodeWebviewProxy from "./VSCodeWebviewProxy";
import { IVSCodeAudioEditorHost, IVSCodeAudioEditorWebview } from "../../src/web/proxies/VSCodeAudioEditor.types";

let isReady = false;

class AudioEditorWebview extends VSCodeWebviewProxy<{}, IVSCodeAudioEditorWebview, IVSCodeAudioEditorHost> {
    static fnNames: (keyof IVSCodeAudioEditorHost)[] = ["ready"];
    private audioEditor: AudioEditor | undefined;
    constructor(private setAudioEditor: (value: React.SetStateAction<AudioEditor | null>) => void) {
        super();
    }
    async init({ data, uri, editable }: { data?: Uint8Array; uri?: string; editable?: boolean }, configuration: AudioEditorConfiguration) {
        const { setAudioEditor } = this;
        const { fftWindowFunction } = configuration;
        configuration.fftWindowFunction = `${fftWindowFunction.slice(0, 1).toLowerCase()}${fftWindowFunction.slice(1).replaceAll(/[-\s]/g, "")}`;
        let arrayBuffer: ArrayBuffer | undefined;
        if (typeof uri === "string") {
            const response = await fetch(uri);
            arrayBuffer = await response.arrayBuffer();
        } else if (data) {
            arrayBuffer = data.buffer;
        }
        if (!arrayBuffer) throw new Error(`Cannot resolve data from ${uri} or data input`);
        const audioContext = new AudioContext({ latencyHint: 0.0001 });
        const audioEditor = await AudioEditor.fromData(arrayBuffer, audioContext, configuration);
        this.audioEditor = audioEditor;
        setAudioEditor(audioEditor);
        window.focus();
        return audioEditor.sampleRate;
    }
    updateConfigurationFromHost({ audioUnit, fftSize, fftOverlap, fftWindowFunction }: AudioEditorConfiguration) {
        this.audioEditor?.setConfiguration({
            audioUnit,
            fftSize,
            fftOverlap,
            fftWindowFunction: `${fftWindowFunction.slice(0, 1).toLowerCase()}${fftWindowFunction.slice(1).replaceAll(/[-\s]/g, "")}`
        });
    }
    playOrStop() {
        const { audioEditor } = this;
        if (!audioEditor) return;
        if (audioEditor.state.playing === "playing") {
            audioEditor.stop();
        } else {
            if (audioEditor.context.state === "suspended") audioEditor.context.resume();
            audioEditor.play();
        }
    }
    pauseOrResume() {
        const { audioEditor } = this;
        if (!audioEditor) return;
        if (audioEditor.state.playing === "playing") audioEditor.pause();
        else audioEditor.resume();
    }
}

const App: FunctionComponent = () => {
    const [audioEditor, setAudioEditor] = useState<AudioEditor | null>(null);
    const [audioEditorWebview, setAudioEditorWebview] = useState<AudioEditorWebview | null>(null);
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
        window.addEventListener("keydown", handleKeyDown);
        const audioEditorWebview = new AudioEditorWebview(setAudioEditor);
        setAudioEditorWebview(audioEditorWebview);
        if (!isReady) {
            audioEditorWebview.ready();
            isReady = true;
        }
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            audioEditorWebview.dispose();
        };
    }, [handleKeyDown]);
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
