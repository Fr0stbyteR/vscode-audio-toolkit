import { PromisifiedFunctionMap, TypedAudioWorkletProcessor, MessagePortRequest, MessagePortResponse, TypedAudioWorkletNodeOptions } from "./types";

export type AudioWorkletProxyProcessor<IProcessor extends {} = {}, INode extends {} = {}, Par extends string = string> = PromisifiedFunctionMap<INode> & TypedAudioWorkletProcessor<MessagePortRequest<IProcessor> & MessagePortResponse<INode>, MessagePortResponse<IProcessor> & MessagePortRequest<INode>, Par> & {
    _disposed: boolean;
    _queuedCalls: { id: number; call: string; args: any[] }[];
};
export declare const AudioWorkletProxyProcessor: {
    fnNames: string[];
    new <IProcessor extends {} = {}, INode extends {} = {}, Par extends string = string, Opt = any>(options?: TypedAudioWorkletNodeOptions<Opt>): AudioWorkletProxyProcessor<IProcessor, INode, Par>;
};
