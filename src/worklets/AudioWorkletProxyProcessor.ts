import { AudioWorkletGlobalScope, MessagePortRequest, MessagePortResponse } from "./types";
import { AudioWorkletProxyProcessor } from "./AudioWorkletProxyProcessor.types";

declare const globalThis: AudioWorkletGlobalScope;
const { AudioWorkletProcessor } = globalThis;

const Processor = class AudioWorkletProxyProcessor extends AudioWorkletProcessor {
    static fnNames: string[] = [];
    _disposed = false;
    _queuedCalls: { id: number; call: string; args: any[] }[] = [];
    constructor(options: AudioWorkletNodeOptions) {
        super(options);
        const Ctor = (this.constructor as typeof AudioWorkletProxyProcessor);
        const resolves: Record<number, ((...args: any[]) => any)> = {};
        const rejects: Record<number, ((...args: any[]) => any)> = {};
        let messagePortRequestId = -1;
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
                this.port.postMessage(r as any);
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
            postMessage({ id, call, args });
        };
        const call = (call: string, ...args: any[]) => {
            const id = messagePortRequestId--;
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
} as typeof AudioWorkletProxyProcessor;

export default Processor;
