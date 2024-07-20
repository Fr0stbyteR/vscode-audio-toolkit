/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { PromisifiedFunctionMap } from "./types";

export type VSCodeHostProxy<IDocument extends vscode.CustomDocument, IHost extends {} = {}, IWebview extends {} = {}> = PromisifiedFunctionMap<IWebview> & IHost & {
    webviewPanel: vscode.WebviewPanel;
    document: IDocument;
    _queuedCalls: { id: number; call: string; args: any[] }[];
};
export declare const VSCodeHostProxy: {
    fnNames: string[];
    prototype: VSCodeHostProxy<any>;
    new <IDocument extends vscode.CustomDocument, IHost extends {} = {}, IWebview extends {} = {}>(webviewPanel: vscode.WebviewPanel, document: IDocument, disposables: vscode.Disposable[]): VSCodeHostProxy<IDocument, IHost, IWebview>;
};
