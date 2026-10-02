import Worker from "./SpectrogramWorker.worker?worker&inline";
import{ ISpectrogramWorker, ISpectrogramWorkerWorker } from "./SpectrogramWorker.types";
import ProxyMain from "./ProxyMain";

export default class SpectrogramWorker extends ProxyMain<ISpectrogramWorker, ISpectrogramWorkerWorker> {
    static Worker = Worker;
    static fnNames: (keyof ISpectrogramWorkerWorker)[] = ["generateResized"];
    handleUpdate: ((...msg: any[]) => any) | undefined;
    updateState(...msg: any[]): void {
        this.handleUpdate?.(...msg);
    }
}
