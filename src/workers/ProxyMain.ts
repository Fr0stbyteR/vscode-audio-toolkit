import { ProxyMain } from "./ProxyMain.types";
import { MessagePortResponse, MessagePortRequest } from "./types";

const Main = class ProxyMain {
    static Worker: new (options?: { name?: string }) => Worker;
    static fnNames: string[] = [];
    _disposed = false;
    dispose!: () => void;
    _queuedCalls: { id: number; call: string; args: any[] }[] = [];
    constructor() {
        const Ctor = (this.constructor as typeof ProxyMain);
        const worker = new Ctor.Worker();
        const resolves: Record<number, ((...args: any[]) => any)> = {};
        const rejects: Record<number, ((...args: any[]) => any)> = {};
        let messagePortRequestId = 1;
        const handleDisposed = () => {
            worker.removeEventListener("message", handleMessage);
            worker.terminate();
        };
        this.dispose = () => {
            if (this._disposed) return;
            this._disposed = true;
            handleDisposed();
            this._queuedCalls.length = 0;
            for (const id of Object.keys(rejects)) {
                rejects[+id](new DOMException("Worker disposed", "AbortError"));
                delete resolves[+id];
                delete rejects[+id];
            }
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
                worker.postMessage(r);
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
            if (this._disposed) return;
            if (!this._queuedCalls.length) return;
            const [{ id, call, args }] = this._queuedCalls.splice(0, 1);
            worker.postMessage({ id, call, args });
        };
        const call = (call: string, ...args: any[]) => {
            if (this._disposed) return Promise.reject(new DOMException("Worker disposed", "AbortError"));
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
        worker.addEventListener("message", handleMessage);
    }
} as typeof ProxyMain;

export default Main;
