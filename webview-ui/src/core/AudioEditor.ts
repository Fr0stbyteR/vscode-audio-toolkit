import TypedEventEmitter from "@shren/typed-event-emitter";
import OperableAudioBuffer from "./OperableAudioBuffer";
import Waveform from "../modules/waveform/Waveform";
import AudioPlayer from "./AudioPlayer";
import { dbtoa } from "../utils";
import { AudioEditorConfiguration, AudioUnit } from "../../../src/web/proxies/VSCodeAudioEditor.types";
import { AudioToolkitModule, AudioToolkitModuleState, FrequencyDomainChannelData, ModulesState } from "./AudioToolkitModule";
import STFTWorker from "../workers/STFTWorker";
import Spectrogram from "../modules/spectrogram/Spectrogram";
import Marker from "../modules/marker/Marker";

export type {
    AudioEditorConfiguration,
    AudioUnit
};

export type AudioPlayingState = "stopped" | "paused" | "playing";

export interface AudioEditorEventMap {
    "viewRange": [number, number];
    "selRange": [number, number] | null;
    "selRangeToPlay": [number, number] | null;
    "playhead": number;
    "enabledChannels": boolean[];
    "playing": AudioPlayingState;
    "monitoring": boolean;
    "loop": boolean;
    "recording": boolean;
    "uiResized": never;
    "setAudio": never;
    "ready": never;
    "configuration": AudioEditorConfiguration;
    "modulesState": ModulesState;
}

export interface AudioEditorState {
    playing: AudioPlayingState;
    monitoring: boolean;
    recording: boolean;
    loop: boolean;
    playhead: number;
    selRange: [number, number] | null;
    viewRange: [number, number];
    enabledChannels: boolean[];
    gain: number;
}
export interface DrawOptions {
    width: number;
    height: number;
    verticalZoom: number;
    verticalOffset: number;
}

class AudioEditor extends TypedEventEmitter<AudioEditorEventMap> {
    static DEFAULT_CONFIGURATION: AudioEditorConfiguration = {
        audioUnit: "time",
        fftSize: 1024,
        fftOverlap: 2,
        fftWindowFunction: "blackmanHarris",
        beatsPerMinute: 60,
        beatsPerMeasure: 4,
        division: 16
    };
    static DEFAULT_MODULES_STATE: ModulesState = [
        { moduleId: "waveform", moduleName: "Map", visible: true, state: { name: "" } },
        { moduleId: "waveform", moduleName: "Waveform", visible: true, state: { name: "" } },
        { moduleId: "spectrogram", moduleName: "Spectrogram", visible: true, state: { name: "" } }
    ];
    static async fromData(data: ArrayBuffer, context: AudioContext, configuration: Partial<AudioEditorConfiguration> = {}, modulesState = this.DEFAULT_MODULES_STATE) {
        const audioBuffer = await context.decodeAudioData(data);
        const operableAudioBuffer: OperableAudioBuffer = Object.setPrototypeOf(audioBuffer, OperableAudioBuffer.prototype);
        const timeDomainData = operableAudioBuffer.toArray(true);
        const stftWorker = new STFTWorker();
        await stftWorker.init();
        const frequencyDomainData = await Promise.all(timeDomainData.map(tdd => stftWorker.stft(tdd, { ...this.DEFAULT_CONFIGURATION, ...configuration })));
        const audioEditor = new AudioEditor(operableAudioBuffer, timeDomainData, frequencyDomainData, context, { ...this.DEFAULT_CONFIGURATION, ...configuration });
        await audioEditor.initPlayer();
        await audioEditor.initModules(modulesState);
        return audioEditor;
    }
    readonly state: AudioEditorState = {
        playing: "stopped",
        monitoring: false,
        loop: true,
        recording: false,
        playhead: 0,
        selRange: null,
        viewRange: [0, 0],
        enabledChannels: [],
        gain: 0
    };
    get length() {
        return this._audioBuffer.length;
    }
    get numberOfChannels() {
        return this._audioBuffer.numberOfChannels;
    }
    get sampleRate() {
        return this._audioBuffer.sampleRate;
    }
    get duration() {
        return this._audioBuffer.duration;
    }
    get audioBuffer() {
        return this._audioBuffer;
    }
    get timeDomainData() {
        return this._timeDomainData;
    }
    get frequencyDomainData() {
        return this._frequencyDomainData;
    }
    get context() {
        return this._context;
    }
    get player() {
        return this._player;
    }
    get configuration() {
        return this._configuration;
    }
    get modulesState() {
        return this._modulesState;
    }
    get modulesInstance() {
        return this._modulesInstance;
    }
    private _player: AudioPlayer | null = null;
    private _modulesState: ModulesState = [];
    private _modulesInstance: AudioToolkitModule[] = [];
    public modulesMap: Record<string, typeof AudioToolkitModule> = {
        [Waveform.MODULE_ID]: Waveform,
        [Spectrogram.MODULE_ID]: Spectrogram,
        [Marker.MODULE_ID]: Marker
    };
    private constructor(
        private _audioBuffer: OperableAudioBuffer,
        private _timeDomainData: Float32Array[],
        private _frequencyDomainData: FrequencyDomainChannelData[],
        private _context: AudioContext,
        private _configuration: AudioEditorConfiguration
    ) {
        super();
        this.setState({
            viewRange: [0, this.length],
            enabledChannels: new Array(this.numberOfChannels).fill(true)
        });
    }
    private async initPlayer() {
        this._player = await AudioPlayer.init(this);
    }
    async initModules(initialtates: ModulesState) {
        for (let i = 0; i < initialtates.length; i++) {
            const { moduleId: id, moduleName: name, state } = initialtates[i];
            await this.addModule(id, state, name);
        }
    }
    setState(state: Partial<AudioEditorState>) {
        Object.assign(this.state, state);
    }
    setConfiguration(configuration: Partial<AudioEditorConfiguration>) {
        this._configuration = { ...this._configuration, ...configuration };
        this.emit("configuration", this._configuration);
    }
    setModuleState(index: number, state: AudioToolkitModuleState) {
        this._modulesState[index] = { ...this._modulesState[index], state };
        this._modulesState = [...this._modulesState];
        this.emit("modulesState", this._modulesState);
    }
    setModuleVisible(index: number, visible: boolean | number) {
        this._modulesState[index] = { ...this._modulesState[index], visible };
        this._modulesState = [...this._modulesState];
        this.emit("modulesState", this._modulesState);
    }
    async addModule(moduleId: string, initialState?: any, moduleName?: string) {
        const Constructor = this.modulesMap[moduleId];
        if (!Constructor) throw new Error(`Module ${moduleId} not found.`);
        const sharableData = this._modulesInstance.find(i => i.moduleId === moduleId)?.getSharableData();
        const instance = await Constructor.fromAudioData(this, initialState, sharableData);
        this._modulesInstance = [...this._modulesInstance, instance];
        this._modulesState = [...this._modulesState, { moduleId, moduleName: moduleName ?? Constructor.MODULE_NAME, visible: true, state: instance.getState() }];
        const handleStateChange = (newState: any) => this.setModuleState(this._modulesInstance.indexOf(instance), newState);
        instance.onStateChange = handleStateChange;
        this.emit("modulesState", this._modulesState);
    }
    removeModule(index: number) {
        this._modulesState.splice(index, 1);
        this._modulesState = this._modulesState.slice();
        this._modulesInstance.splice(index, 1);
        this._modulesInstance = this._modulesInstance.slice();
        this.emit("modulesState", this._modulesState);
    }
    moveModule(fromIndex: number, toIndex: number) {
        const [ms] = this._modulesState.splice(fromIndex, 1);
        this._modulesState.splice(toIndex, 0, ms);
        this._modulesState = this._modulesState.slice();
        const [mi] = this._modulesInstance.splice(fromIndex, 1);
        this._modulesInstance.splice(toIndex, 0, mi);
        this._modulesInstance = this._modulesInstance.slice();
        this.emit("modulesState", this._modulesState);
    }
    zoomH(refIn: number, factor: number) { // factor = 1 as zoomIn, -1 as zoomOut
        const { viewRange } = this.state;
        const { length } = this;
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const minRange = Math.min(length, 5);
        const ref = Math.max(0, Math.min(length, Math.round(refIn)));
        if (ref < viewStart || ref > viewEnd) {
            const start = Math.max(0, Math.min(length - viewLength, Math.round(ref - viewLength / 2)));
            const end = Math.max(viewLength, Math.min(length, Math.round(ref + viewLength / 2)));
            const range: [number, number] = [start, end];
            this.setState({ viewRange: range });
            this.emit("viewRange", range);
        } else if (factor < 0 || viewLength > minRange) {
            const multiplier = 1.5 ** -factor;
            const start = ref - (ref - viewStart) * multiplier;
            const end = ref + (viewEnd - ref) * multiplier;
            this.setViewRange([start, end]);
        }
    }
    scrollH(speed: number) { // spped = 1 as one full viewRange
        const { viewRange } = this.state;
        if (!speed) return viewRange.slice() as [number, number];
        const { length } = this;
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const deltaSamples = Math.round(speed > 0 ? Math.max(1, viewLength * speed) : Math.min(-1, viewLength * speed));
        const start = Math.max(0, Math.min(length - viewLength, viewStart + deltaSamples));
        const end = Math.min(length, Math.max(viewLength, viewEnd + deltaSamples));
        this.setViewRange([start, end]);
        return [start, end] as [number, number];
    }
    setEnabledChannel(channel: number, enabled: boolean) {
        const enabledChannels = this.state.enabledChannels.slice();
        enabledChannels[channel] = enabled;
        this.setState({ enabledChannels });
        this.emit("enabledChannels", enabledChannels);
    }
    setLoop(loop: boolean) {
        this.setState({ loop });
        this.emit("loop", loop);
    }
    setPlayhead(playheadIn: number, fromPlayer?: boolean) {
        const shouldReplay = !fromPlayer && this.state.playing === "playing";
        if (shouldReplay) this.stop();
        const { length } = this;
        const playhead = Math.max(0, Math.min(length, Math.round(playheadIn)));
        this.setState({ playhead });
        this.emit("playhead", playhead);
        if (shouldReplay) this.play();
    }
    async selectAll() {
        this.setSelRangeToAll();
    }
    emitSelRangeToPlay() {
        this.emit("selRangeToPlay", this.state.selRange);
    }
    setSelRange(range: [number, number] | null) {
        if (!range) {
            this.setState({ selRange: null });
            this.emit("selRange", null);
            return;
        }
        const { length } = this;
        let [start, end] = range;
        if (end < start) [start, end] = [end, start];
        start = Math.max(0, Math.min(length - 1, Math.round(start)));
        end = Math.max(1, Math.min(length, Math.round(end)));
        if (start === end) {
            this.setState({ selRange: null });
            this.emit("selRange", null);
            return;
        }
        const selRange: [number, number] = [start, end];
        this.setState({ selRange, playhead: start });
        this.emit("selRange", selRange);
        this.emit("playhead", start);
    }
    setSelRangeToAll() {
        const { length } = this;
        const selRange: [number, number] = [0, length];
        this.setState({ selRange });
        this.emit("selRange", selRange);
        this.emitSelRangeToPlay();
    }
    setViewRange(range: [number, number]) {
        const { length } = this;
        let [start, end] = range;
        if (end < start) [start, end] = [end, start];
        const minRange = Math.min(length, 5);
        start = Math.max(0, Math.min(length - minRange, Math.round(start)));
        end = Math.max(minRange, Math.min(length, Math.round(end)));
        const viewRange: [number, number] = [start, end];
        this.setState({ viewRange });
        this.emit("viewRange", viewRange);
    }
    setViewRangeToAll() {
        const { length } = this;
        const viewRange: [number, number] = [0, length];
        this.setState({ viewRange });
        this.emit("viewRange", viewRange);
    }
    play() {
        const playing: AudioPlayingState = "playing";
        this.setState({ playing });
        this.emit("playing", playing);
        this.player!.play();
    }
    pause() {
        const playing: AudioPlayingState = "paused";
        this.setState({ playing });
        this.emit("playing", playing);
        this.player!.stop();
    }
    resume() {
        const playing: AudioPlayingState = "playing";
        this.setState({ playing });
        this.emit("playing", playing);
        this.player!.play();
    }
    stop() {
        const playing: AudioPlayingState = "stopped";
        this.setState({ playing });
        this.emit("playing", playing);
        this.player!.stop();
    }
    setGain(gain: number) {
        this.state.gain = gain;
        const { playing, monitoring } = this.state;
        if (monitoring || playing === "playing") this.player!.postFxGainNode.gain.setTargetAtTime(dbtoa(gain), this.context.currentTime, 0.01);
    }
    handlePlayerEnded(playhead: number) {
        const playing: AudioPlayingState = "stopped";
        this.setState({ playing });
        this.emit("playing", playing);
        this.setPlayhead(playhead);
    };
}

export default AudioEditor;
