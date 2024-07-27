/* eslint-disable curly */
/* eslint-disable @typescript-eslint/naming-convention */

import { WebviewApi } from "vscode-webview";
import { VSCodeWebviewProxy } from "./VSCodeWebviewProxy.types";
import { MessagePortResponse, MessagePortRequest } from "./workers/types";

let vscodeApi: WebviewApi<any>;
if (typeof acquireVsCodeApi === "function") {
    vscodeApi = acquireVsCodeApi();
} else {
    vscodeApi = {
        postMessage(msg) {
            console.log(msg);
        },
        setState(newState) {
            localStorage.setItem("vscodeState", JSON.stringify(newState));
            return newState;
        },
        getState() {
            const state = localStorage.getItem("vscodeState");
            return state ? JSON.parse(state) : undefined;
        }
    };
}

const Proxy = class VSCodeWebviewProxy {
    static fnNames: string[] = [];
    static vscodeApi: WebviewApi<any> = vscodeApi;
    _queuedCalls: { id: number; call: string; args: any[] }[] = [];
    dispose: () => void;
    constructor() {
        const Ctor = (this.constructor as typeof VSCodeWebviewProxy);
        const resolves: Record<number, ((...args: any[]) => any)> = {};
        const rejects: Record<number, ((...args: any[]) => any)> = {};
        let messagePortRequestId = -1;
        const handleMessage = async (e: MessageEvent<MessagePortResponse & MessagePortRequest>) => {
            const { id, call, args, value, error } = e.data;
            if (call) {
                const r: MessagePortResponse = { id };
                try {
                    r.value = await (this as any)[call](...args);
                } catch (e) {
                    r.error = (e as any).toString();
                }
                Ctor.vscodeApi.postMessage(r as any);
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
            Ctor.vscodeApi.postMessage({ id, call, args });
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
        this.dispose = () => window.removeEventListener("message", handleMessage);
        Ctor.fnNames.forEach(name => (this as any)[name] = (...args: any[]) => call(name, ...args));
        window.addEventListener("message", handleMessage);
    }
    setState(newState: any) {
        return (this.constructor as typeof VSCodeWebviewProxy).vscodeApi.setState(newState);
    }
    getState() {
        return (this.constructor as typeof VSCodeWebviewProxy).vscodeApi.getState();
    }
} as typeof VSCodeWebviewProxy;

export default Proxy;
