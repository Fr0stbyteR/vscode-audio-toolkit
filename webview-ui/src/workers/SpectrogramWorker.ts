import workerUrl from "./SpectrogramWorker.worker?worker&url";
import{ ISpectrogramWorker, ISpectrogramWorkerWorker } from "./SpectrogramWorker.types";
import ProxyMain from "./ProxyMain";

export default class SpectrogramWorker extends ProxyMain<ISpectrogramWorker, ISpectrogramWorkerWorker> {
    static workerUrl = workerUrl;
    static fnNames: (keyof ISpectrogramWorkerWorker)[] = ["init", "forward", "stft", "updateSpectrogramData", "generateResized", "inverse", "inverses"];
    handleUpdate: ((...msg: any[]) => any) | undefined;
    updateState(...msg: any[]): void {
        this.handleUpdate?.(...msg);
    }
}
