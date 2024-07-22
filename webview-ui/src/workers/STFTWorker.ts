import Worker from "./STFTWorker.worker?worker&inline";
import{ ISTFTWorker, ISTFTWorkerWorker } from "./STFTWorker.types";
import ProxyMain from "./ProxyMain";

export default class STFTWorker extends ProxyMain<ISTFTWorker, ISTFTWorkerWorker> {
    static Worker = Worker;
    static fnNames: (keyof ISTFTWorkerWorker)[] = ["init", "forward", "stft", "inverse", "istft"];
    handleUpdate: ((...msg: any[]) => any) | undefined;
    updateState(...msg: any[]): void {
        this.handleUpdate?.(...msg);
    }
}
