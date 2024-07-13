import TypedEventEmitter from "@shren/typed-event-emitter";
import OperableAudioBuffer from "./OperableAudioBuffer";
import Waveform from "./Waveform";
import Spectrogram from "./Spectrogram";
import AudioPlayer from "./AudioPlayer";
import { dbtoa } from "../utils";

export type AudioPlayingState = "stopped" | "paused" | "playing";

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


class AudioEditor extends TypedEventEmitter<AudioEditorEventMap> {
    static async fromData(data: ArrayBuffer, context: BaseAudioContext) {
        const audioBuffer = await context.decodeAudioData(data);
        const operableAudioBuffer: OperableAudioBuffer = Object.setPrototypeOf(audioBuffer, OperableAudioBuffer.prototype);
        const waveform = await Waveform.fromAudioBuffer(operableAudioBuffer);
        const spectrogram = await Spectrogram.fromAudioBuffer(operableAudioBuffer);
        const audioEditor = new AudioEditor(operableAudioBuffer, waveform, spectrogram, context);
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
    private _player: AudioPlayer | null = null;
    private constructor(
        private _audioBuffer: OperableAudioBuffer,
        private _waveform: Waveform,
        private _spectrogram: Spectrogram,
        private _context: BaseAudioContext
    ) {
        super();
    }
    private async initPlayer() {
        this._player = await AudioPlayer.init(this);
    }
    setState(state: Partial<AudioEditorState>) {
        Object.assign(this.state, state);
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
    setSelRange(range: [number, number]) {
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
