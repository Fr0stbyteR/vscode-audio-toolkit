import { MessagePortResponse, MessagePortRequest } from "./types";
import { AudioWorkletProxyNode } from "./AudioWorkletProxyNode.types";
import AudioWorkletRegister from "./AudioWorkletRegister";

const Node = class AudioWorkletProxyNode extends AudioWorkletNode {
    static processorId: string;
    static processorUrl: string;
    static fnNames: string[] = [];
    static register(audioWorklet: AudioWorklet) {
        return AudioWorkletRegister.register(audioWorklet, this.processorId, this.processorUrl);
    }
    _disposed = false;
    _queuedCalls: { id: number; call: string; args: any[] }[] = [];
    constructor(context: AudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options);
        const Ctor = (this.constructor as typeof AudioWorkletProxyNode);
        const resolves: Record<number, ((...args: any[]) => any)> = {};
        const rejects: Record<number, ((...args: any[]) => any)> = {};
        let messagePortRequestId = 1;
        const handleDisposed = () => {
            this.port.removeEventListener("message", handleMessage);
            this.port.close();
        };
        const handleMessage = async (e: MessageEvent<MessagePortResponse & MessagePortRequest>) => {
            const { id, call, args, value, error } = e.data;
            if (call) {
                const r: MessagePortResponse = { id };
                try {
                    r.value = await (this as any)[call](...args);
                } catch (e) {
                    r.error = e as Error;
                }
                this.port.postMessage(r);
                if (this._disposed) handleDisposed();
            } else {
                if (error) rejects[id]?.(error);
                else if (resolves[id]) resolves[id]?.(value);
                delete resolves[id];
                delete rejects[id];
                nextCall();
            }
        };
        const nextCall = () => {
            if (!this._queuedCalls.length) return;
            const [{ id, call, args }] = this._queuedCalls.splice(0, 1);
            this.port.postMessage({ id, call, args });
        };
        const call = (call: string, ...args: any[]) => {
            const id = messagePortRequestId++;
            const _queuedCallsLength = this._queuedCalls.push({ id, call, args });
            const promise = new Promise<any>((resolve, reject) => {
                resolves[id] = resolve;
                rejects[id] = reject;
            });
            if (_queuedCallsLength === 1) nextCall();
            return promise;
        };
        Ctor.fnNames.forEach(name => (this as any)[name] = (...args: any[]) => call(name, ...args));
        this.port.start();
        this.port.addEventListener("message", handleMessage);
    }
} as typeof AudioWorkletProxyNode;

export default Node;
