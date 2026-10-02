import { PromisifiedFunctionMap } from "./types";

export type ProxyWorker<IWorker extends {} = {}, IMain extends {} = {}> = PromisifiedFunctionMap<IMain> & IWorker & {
    _disposed: boolean;
    getTransferables(value: any): Transferable[];
    _queuedCalls: { id: number; call: string; args: any[] }[];
};
export declare const ProxyWorker: {
    fnNames: string[];
    prototype: ProxyWorker;
    new <IWorker extends {} = {}, IMain extends {} = {}>(): ProxyWorker<IWorker, IMain>;
};
