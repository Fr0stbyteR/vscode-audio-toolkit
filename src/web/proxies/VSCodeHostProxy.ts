/* eslint-disable curly */
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { VSCodeHostProxy } from "./VSCodeHostProxy.types";
import { MessagePortResponse, MessagePortRequest } from "./types";

const Proxy = class VSCodeHostProxy {
    static fnNames: string[] = [];
    _queuedCalls: { id: number; call: string; args: any[] }[] = [];
    constructor(
        public webviewPanel: vscode.WebviewPanel,
        public document: vscode.CustomDocument,
        disposables: vscode.Disposable[]
    ) {
        const Ctor = (this.constructor as typeof VSCodeHostProxy);
        const resolves: Record<number, ((...args: any[]) => any)> = {};
        const rejects: Record<number, ((...args: any[]) => any)> = {};
        let messagePortRequestId = 1;
        const handleMessage = async (data: MessagePortResponse & MessagePortRequest) => {
            const { id, call, args, value, error } = data;
            if (call) {
                const r: MessagePortResponse = { id };
                try {
                    r.value = await (this as any)[call](...args);
                } catch (e) {
                    r.error = e as Error;
                }
                webviewPanel.webview.postMessage(r);
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
            webviewPanel.webview.postMessage({ id, call, args });
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
        webviewPanel.webview.onDidReceiveMessage(handleMessage, undefined, disposables);
    }
} as typeof VSCodeHostProxy;

export default Proxy;
