import processorUrl from "./PeakAnalyser.worklet?worker&url";
import AudioWorkletProxyNode from "./AudioWorkletProxyNode";
import { IPeakAnalyserNode, IPeakAnalyserProcessor, PeakAnalyserParameters } from "./PeakAnalyserWorklet.types";
import AudioWorkletRegister from "./AudioWorkletRegister";

export const processorId = "__JSPatcher_TemporalAnalyser";
export default class PeakAnalyserNode extends AudioWorkletProxyNode<IPeakAnalyserNode, IPeakAnalyserProcessor, PeakAnalyserParameters> implements IPeakAnalyserNode {
    static processorId = processorId;
    static register = (audioWorklet: AudioWorklet) => AudioWorkletRegister.register(audioWorklet, processorId, processorUrl);
    static fnNames: (keyof IPeakAnalyserProcessor)[] = ["getPeak", "getPeakSinceLastGet", "destroy"];
    constructor(context: BaseAudioContext) {
        super(context, processorId, { numberOfInputs: 1, numberOfOutputs: 0 });
        const _destroy = this.destroy;
        this.destroy = async () => {
            await _destroy.call(this);
            this._disposed = true;
        };
    }
}
