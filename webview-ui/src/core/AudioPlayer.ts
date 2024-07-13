import { dbtoa } from "../utils";
import AudioEditor from "./AudioEditor";
import PeakAnalyserNode from "../worklets/PeakAnalyserNode";

export default class AudioPlayer {
    static async init(editor: AudioEditor) {
        const audioPlayer = new AudioPlayer(editor);
        await audioPlayer.initPeakAnalyser();
        return audioPlayer;
    }
    readonly editor: AudioEditor;
    readonly dummyAnalyserNode: AnalyserNode;
    readonly preFxGainNode: GainNode;
    readonly postFxGainNode: GainNode;
    playing: boolean;
    currentSample: number;
    currentTime: number;
    currentChannels: boolean[];
    bufferSourceNode: AudioBufferSourceNode | undefined;
    splitterNode: ChannelSplitterNode | undefined;
    mergerNode: ChannelMergerNode | undefined;
    peakAnalyserNode!: PeakAnalyserNode;
    // monitoring: boolean;
    get context() {
        return this.editor.context;
    }
    get destination() {
        return this.context.destination;
    }
    get loop() {
        return this.bufferSourceNode?.loop;
    }
    handleLoopChanged = (loopIn: boolean) => {
        const { bufferSourceNode, editor } = this;
        if (!bufferSourceNode) return;
        const { buffer, loop } = bufferSourceNode;
        if (!buffer) return;
        if (loop === loopIn) return;
        const { sampleRate } = buffer;
        const selRange = editor.state.selRange;
        bufferSourceNode.loop = loopIn;
        if (loopIn) {
            if (selRange) {
                bufferSourceNode.loopStart = selRange[0] / sampleRate;
                bufferSourceNode.loopEnd = selRange[1] / sampleRate;
            } else {
                bufferSourceNode.loopStart = 0;
                bufferSourceNode.loopEnd = 0;
            }
            bufferSourceNode.stop(Number.MAX_VALUE);
        } else {
            bufferSourceNode.loopStart = 0;
            bufferSourceNode.loopEnd = 0;
            if (selRange) bufferSourceNode.stop(this.currentTime + (selRange[1] - this.currentSample) / sampleRate);
            else bufferSourceNode.stop(Number.MAX_VALUE);
        }
    };
    handleSelRangeChanged = (selRange: [number, number] | null) => {
        const { bufferSourceNode } = this;
        if (!bufferSourceNode) return;
        const { buffer, loop } = bufferSourceNode;
        if (!buffer) return;
        const { sampleRate } = buffer;
        if (loop) {
            if (selRange) {
                bufferSourceNode.loopStart = selRange[0] / sampleRate;
                bufferSourceNode.loopEnd = selRange[1] / sampleRate;
            } else {
                bufferSourceNode.loopStart = 0;
                bufferSourceNode.loopEnd = 0;
            }
        } else {
            bufferSourceNode.loopStart = 0;
            bufferSourceNode.loopEnd = 0;
            if (selRange) bufferSourceNode.stop(this.currentTime + (selRange[1] - this.currentSample) / sampleRate);
            else bufferSourceNode.stop(Number.MAX_VALUE);
        }
    };
    handleEnded = () => {
        const { bufferSourceNode } = this;
        if (!bufferSourceNode) return;
        this.editor.handlePlayerEnded(this.getCurrentSample());
        this.bufferSourceNode!.removeEventListener("ended", this.handleEnded);
        this.bufferSourceNode!.disconnect();
        this.splitterNode!.disconnect();
        this.mergerNode!.disconnect();
        delete this.bufferSourceNode;
        delete this.splitterNode;
        delete this.mergerNode;
    };
    handleEnabledChannelsChanged = (enabledChannels: boolean[]) => {
        const { bufferSourceNode } = this;
        if (!bufferSourceNode) return;
        this.currentChannels.forEach((enabled, i) => {
            if (enabledChannels[i] !== enabled) {
                if (enabledChannels[i]) this.splitterNode!.connect(this.mergerNode!, i, i);
                else this.splitterNode!.disconnect(this.mergerNode!, i, i);
            }
        });
        this.currentChannels = enabledChannels.slice();
    };

    updateCursorScheduled = false;
    $updateCursorRaf = -1;
    updateCursorCallback = () => {
        this.$updateCursorRaf = -1;
        this.updateCursorScheduled = false;
        this.updateCursor();
    };
    scheduleUpdateCursor = () => {
        if (this.updateCursorScheduled) return;
        if (this.$updateCursorRaf === -1) this.$updateCursorRaf = requestAnimationFrame(this.updateCursorCallback);
        this.updateCursorScheduled = true;
    };
    updateCursor() {
        if (!this.bufferSourceNode) return;
        this.editor.setCursor(this.getCurrentSample(), true);
        this.scheduleUpdateCursor();
    }
    private constructor(editor: AudioEditor) {
        const { state } = editor;
        const { enabledChannels, selRange, cursor, gain } = state;
        this.editor = editor;
        this.playing = false;
        // this.monitoring = false;
        this.dummyAnalyserNode = this.context.createAnalyser();
        this.preFxGainNode = this.context.createGain();
        this.postFxGainNode = this.context.createGain();
        this.preFxGainNode.connect(this.postFxGainNode);
        this.postFxGainNode.connect(this.destination);
        // .preFxGainNode.gain.value = dbtoa(preFxGain);
        this.postFxGainNode.gain.value = dbtoa(gain);
        this.currentChannels = enabledChannels;
        this.currentTime = this.context.currentTime;
        this.currentSample = selRange ? selRange[0] : cursor;
        // this.destination.channelInterpretation = "discrete";
        this.editor.on("loop", this.handleLoopChanged);
        this.editor.on("selRangeToPlay", this.handleSelRangeChanged);
        this.editor.on("enabledChannels", this.handleEnabledChannelsChanged);
    }
    private async initPeakAnalyser() {
        const audioWorklet = this.context.audioWorklet;
        await PeakAnalyserNode.register(audioWorklet);
        this.peakAnalyserNode = new PeakAnalyserNode(this.context);
        this.preFxGainNode.connect(this.peakAnalyserNode);
    }
    async destroy() {
        // if (this.monitoring) this.stopMonitoring();
        if (this.playing) this.stop();
        await this.peakAnalyserNode.destroy();
    }
    getCurrentSample() {
        if (!this.bufferSourceNode) return 0;
        const { buffer } = this.bufferSourceNode;
        if (!buffer) return 0;
        const delta = (this.context.currentTime - this.currentTime) * buffer.sampleRate;
        const selRange = this.editor.state?.selRange || [0, buffer.length];
        this.currentSample += delta;
        this.currentTime = this.context.currentTime;
        if (this.loop) {
            if (this.currentSample > selRange[1]) this.currentSample = (this.currentSample - selRange[0]) % (selRange[1] - selRange[0]) + selRange[0];
        } else {
            if (this.currentSample > selRange[1]) this.currentSample = selRange[1];
        }
        return ~~this.currentSample;
    }
    play() {
        this.stop();
        const audio = this.editor;
        const { cursor, selRange, enabledChannels, gain, loop } = this.editor.state;
        const { sampleRate, numberOfChannels, audioBuffer } = audio;
        const offset = (selRange ? selRange[0] : cursor) / sampleRate;
        const duration = selRange ? (selRange[1] - selRange[0]) / sampleRate : undefined;
        const bufferSourceNode = this.context.createBufferSource();
        bufferSourceNode.channelCountMode = "explicit";
        bufferSourceNode.channelInterpretation = "discrete";
        bufferSourceNode.channelCount = numberOfChannels;
        this.currentTime = this.context.currentTime;
        this.currentSample = selRange ? selRange[0] : cursor;
        this.currentChannels = enabledChannels.slice();
        this.bufferSourceNode = bufferSourceNode;
        this.splitterNode = this.context.createChannelSplitter(numberOfChannels);
        this.mergerNode = this.context.createChannelMerger(numberOfChannels);
        this.mergerNode!.channelInterpretation = "discrete";
        this.postFxGainNode.gain.value = dbtoa(gain);
        bufferSourceNode.buffer = audioBuffer;
        // bufferSourceNode.connect(this.dummyAnalyserNode);
        bufferSourceNode.connect(this.splitterNode);
        enabledChannels.forEach((enabled, i) => {
            if (enabled && i < numberOfChannels) this.splitterNode!.connect(this.mergerNode!, i, i);
        });
        this.mergerNode.connect(this.preFxGainNode);
        bufferSourceNode.loop = !!loop;
        bufferSourceNode.addEventListener("ended", this.handleEnded);
        if (loop) {
            if (duration) {
                bufferSourceNode.loopStart = offset;
                bufferSourceNode.loopEnd = offset + duration;
            }
            bufferSourceNode.start(this.currentTime, offset);
        } else {
            bufferSourceNode.start(this.currentTime, offset);
            if (duration) bufferSourceNode.stop(this.currentTime + duration);
            else bufferSourceNode.stop(Number.MAX_VALUE);
        }
        this.playing = true;
        this.scheduleUpdateCursor();
    }
    stop() {
        if (!this.bufferSourceNode) return;
        this.bufferSourceNode.stop();
        this.bufferSourceNode.removeEventListener("ended", this.handleEnded);
        this.bufferSourceNode.disconnect();
        this.splitterNode!.disconnect();
        this.mergerNode!.disconnect();
        delete this.bufferSourceNode;
        delete this.splitterNode;
        delete this.mergerNode;
        this.playing = false;
    }
}
