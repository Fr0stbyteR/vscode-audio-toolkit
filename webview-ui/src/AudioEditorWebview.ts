import { IVSCodeAudioEditorWebview, IVSCodeAudioEditorHost } from "../../src/web/proxies/VSCodeAudioEditor.types";
import AudioEditor, { AudioEditorConfiguration } from "./core/AudioEditor";
import VSCodeWebviewProxy from "./VSCodeWebviewProxy";

class AudioEditorWebview extends VSCodeWebviewProxy<{}, IVSCodeAudioEditorWebview, IVSCodeAudioEditorHost> {
    static fnNames: (keyof IVSCodeAudioEditorHost)[] = ["ready"];
    private audioEditor: AudioEditor | undefined;
    private setAudioEditor: React.Dispatch<React.SetStateAction<AudioEditor | null>> | undefined;
    attachReact(setAudioEditor: React.Dispatch<React.SetStateAction<AudioEditor | null>>) {
        this.setAudioEditor = setAudioEditor;
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
        setAudioEditor!(audioEditor);
        window.focus();
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.key !== "") return;
            if (!audioEditor) return;
            if (audioEditor.context.state === "suspended" && audioEditor.state.playing !== "playing") {
                await audioEditor.context.resume();
                audioEditor.play();
                window.removeEventListener("keydown", handleKeyDown);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
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

export default AudioEditorWebview;
