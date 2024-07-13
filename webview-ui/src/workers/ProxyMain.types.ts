import { PromisifiedFunctionMap } from "./types";

export type ProxyMain<IMain extends {} = {}, IWorker extends {} = {}> = PromisifiedFunctionMap<IWorker> & IMain & {
    _disposed: boolean;
    _queuedCalls: { id: number; call: string; args: any[] }[];
};
export declare const ProxyMain: {
    Worker: new (options?: { name?: string }) => Worker;
    fnNames: string[];
    prototype: ProxyMain;
    new <IMain extends {} = {}, IWorker extends {} = {}>(): ProxyMain<IMain, IWorker>;
};
