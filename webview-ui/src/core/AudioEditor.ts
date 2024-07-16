import TypedEventEmitter from "@shren/typed-event-emitter";
import OperableAudioBuffer from "./OperableAudioBuffer";
import Waveform from "./Waveform";
import Spectrogram from "./Spectrogram";
import AudioPlayer from "./AudioPlayer";
import { dbtoa } from "../utils";

export type AudioPlayingState = "stopped" | "paused" | "playing";
export type AudioUnit = "time" | "sample" | "measure";

export interface AudioEditorConfiguration {
    audioUnit: AudioUnit;
    fftSize: number;
    fftOverlap: number;
    fftWindowFunction: string;
    beatsPerMinute: number;
    beatsPerMeasure: number;
    division: number;
}

export interface AudioEditorEventMap {
    "viewRange": [number, number];
    "selRange": [number, number] | null;
    "selRangeToPlay": [number, number] | null;
    "cursor": number;
    "enabledChannels": boolean[];
    "playing": AudioPlayingState;
    "monitoring": boolean;
    "loop": boolean;
    "recording": boolean;
    "uiResized": never;
    "setAudio": never;
    "ready": never;
    "configuration": AudioEditorConfiguration;
}

export interface AudioEditorState {
    playing: AudioPlayingState;
    monitoring: boolean;
    recording: boolean;
    loop: boolean;
    cursor: number;
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
    static async fromData(data: ArrayBuffer, context: AudioContext, configuration: Partial<AudioEditorConfiguration> = {}) {
        const audioBuffer = await context.decodeAudioData(data);
        const operableAudioBuffer: OperableAudioBuffer = Object.setPrototypeOf(audioBuffer, OperableAudioBuffer.prototype);
        const audioData = operableAudioBuffer.toArray(true);
        const waveform = await Waveform.fromAudioData(audioData, audioBuffer.sampleRate);
        const spectrogram = await Spectrogram.fromAudioBuffer(operableAudioBuffer);
        const audioEditor = new AudioEditor(operableAudioBuffer, waveform, spectrogram, context, { ...this.DEFAULT_CONFIGURATION, ...configuration });
        await audioEditor.initPlayer();
        return audioEditor;
    }
    readonly state: AudioEditorState = {
        playing: "stopped",
        monitoring: false,
        loop: true,
        recording: false,
        cursor: 0,
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
    get waveform() {
        return this._waveform;
    }
    get spectrogram() {
        return this._spectrogram;
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
    private _player: AudioPlayer | null = null;
    private constructor(
        private _audioBuffer: OperableAudioBuffer,
        private _waveform: Waveform,
        private _spectrogram: Spectrogram,
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
    setState(state: Partial<AudioEditorState>) {
        Object.assign(this.state, state);
    }
    setConfiguration(configuration: Partial<AudioEditorConfiguration>) {
        this._configuration = { ...this._configuration, ...configuration };
        this.emit("configuration", this._configuration);
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
        const { length } = this;
        const [viewStart, viewEnd] = viewRange;
        const viewLength = viewEnd - viewStart;
        const deltaSamples = viewLength * speed;
        const start = Math.min(length - viewLength, viewStart + deltaSamples);
        const end = Math.max(viewLength, viewEnd + deltaSamples);
        this.setViewRange([start, end]);
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
    setCursor(cursorIn: number, fromPlayer?: boolean) {
        const shouldReplay = !fromPlayer && this.state.playing === "playing";
        if (shouldReplay) this.stop();
        const { length } = this;
        const cursor = Math.max(0, Math.min(length, Math.round(cursorIn)));
        this.setState({ cursor });
        this.emit("cursor", cursor);
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
        this.setState({ selRange, cursor: start });
        this.emit("selRange", selRange);
        this.emit("cursor", start);
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
    handlePlayerEnded(cursor: number) {
        const playing: AudioPlayingState = "stopped";
        this.setState({ playing });
        this.emit("playing", playing);
        this.setCursor(cursor);
    };
}

export default AudioEditor;
