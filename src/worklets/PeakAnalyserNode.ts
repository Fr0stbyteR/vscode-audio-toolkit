import processorUrl from "./PeakAnalyser.worklet?worker&url";
import AudioWorkletProxyNode from "./AudioWorkletProxyNode";
import { IPeakAnalyserNode, IPeakAnalyserProcessor, PeakAnalyserParameters } from "./PeakAnalyserWorklet.types";

export const processorId = "__AudioToolkit_PeakAnalyser";
export default class PeakAnalyserNode extends AudioWorkletProxyNode<IPeakAnalyserNode, IPeakAnalyserProcessor, PeakAnalyserParameters> implements IPeakAnalyserNode {
    static processorId = processorId;
    static processorUrl = processorUrl;
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
