/* eslint-disable @typescript-eslint/naming-convention */
import { WebviewApi } from "vscode-webview";
import { PromisifiedFunctionMap } from "./workers/types";

export type VSCodeWebviewProxy<IState = any, IWebview extends {} = {}, IHost extends {} = {}> = PromisifiedFunctionMap<IHost> & IWebview & {
    _queuedCalls: { id: number; call: string; args: any[] }[];
    dispose(): void;
    setState(newState: IState): IState;
    getState(): IState;
};
export declare const VSCodeWebviewProxy: {
    vscodeApi: WebviewApi<any>;
    fnNames: string[];
    prototype: VSCodeWebviewProxy;
    new <IState = any, IWebview extends {} = {}, IHost extends {} = {}>(): VSCodeWebviewProxy<IState, IWebview, IHost>;
};
