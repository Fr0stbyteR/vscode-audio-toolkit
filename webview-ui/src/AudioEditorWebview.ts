import { IVSCodeAudioEditorWebview, IVSCodeAudioEditorHost } from "../../src/web/proxies/VSCodeAudioEditor.types";
import AudioEditor, { AudioEditorConfiguration } from "./core/AudioEditor";
import { AudioToolkitModulesState } from "./core/AudioToolkitModule";
import VSCodeWebviewProxy from "./VSCodeWebviewProxy";

class AudioEditorWebview extends VSCodeWebviewProxy<AudioToolkitModulesState, IVSCodeAudioEditorWebview, IVSCodeAudioEditorHost> {
    static fnNames: (keyof IVSCodeAudioEditorHost)[] = ["ready", "makeEditModulesState", "makeEditModulesState"];
    public audioEditor: AudioEditor | undefined;
    private _initialModuleState: AudioToolkitModulesState | null | undefined;
    constructor(
        public initCallback: (webview: AudioEditorWebview, fileInfo: { data?: Uint8Array; uri?: string; editable?: boolean }, configuration: AudioEditorConfiguration, modulesState?: AudioToolkitModulesState | null) => Promise<number>
    ) {
        super();
    }

    init(fileInfo: { data?: Uint8Array; uri?: string; editable?: boolean }, configuration: AudioEditorConfiguration, modulesState: AudioToolkitModulesState | null = this.getState()) {
        this._initialModuleState = modulesState;
        return this.initCallback(this, fileInfo, configuration, modulesState);
    }
    updateConfigurationFromHost({ audioUnit, fftSize, fftOverlap, fftWindowFunction }: AudioEditorConfiguration) {
        this.audioEditor?.setConfiguration({
            audioUnit,
            fftSize,
            fftOverlap,
            fftWindowFunction: `${fftWindowFunction.slice(0, 1).toLowerCase()}${fftWindowFunction.slice(1).replaceAll(/[-\s]/g, "")}`
        });
    }
    updateModulesStateFromHost(modulesState: AudioToolkitModulesState | null) {
        if (!this.audioEditor) return;
        this.audioEditor.makingEdit = false;
        this.audioEditor.setModulesState(modulesState ?? this._initialModuleState ?? AudioEditor.DEFAULT_MODULES_STATE);
        this.audioEditor.makingEdit = true;
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
