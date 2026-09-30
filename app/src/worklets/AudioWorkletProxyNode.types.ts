import { PromisifiedFunctionMap, TypedAudioWorkletNode, MessagePortRequest, MessagePortResponse, TypedAudioWorkletNodeOptions } from "./types";

export type AudioWorkletProxyNode<INode extends {} = {}, IProcessor extends {} = {}, Par extends string = string, EventMap extends Record<string, any> = any> = PromisifiedFunctionMap<IProcessor> & TypedAudioWorkletNode<MessagePortRequest<INode> & MessagePortResponse<IProcessor>, MessagePortResponse<INode> & MessagePortRequest<IProcessor>, Par, EventMap> & {
    _disposed: boolean;
    _queuedCalls: { id: number; call: string; args: any[] }[];
};
export declare const AudioWorkletProxyNode: {
    processorId: string;
    processorUrl: string;
    fnNames: string[];
    register(audioWorklet: AudioWorklet): Promise<void>;
    new <INode extends {} = {}, IProcessor extends {} = {}, Par extends string = string, Opt = any, EventMap extends Record<string, any> = any>(context: BaseAudioContext, name: string, options?: TypedAudioWorkletNodeOptions<Opt>): AudioWorkletProxyNode<INode, IProcessor, Par, EventMap>;
};
//'https://file+.vscode-resource.vscode-cdn.net/d%3A/p/audio-toolkit/dist/web/webview/assets/PeakAnalyser.worklet-Dc9cGfeV.js'