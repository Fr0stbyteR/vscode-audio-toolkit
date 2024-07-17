import Worker from "./WaveformWorker.worker?worker&inline";
import { IWaveformWorker } from "./WaveformWorker.types";
import ProxyMain from "./ProxyMain";

export default class WaveformWorker extends ProxyMain<{}, IWaveformWorker> {
    static Worker = Worker;
    static fnNames: (keyof IWaveformWorker)[] = ["generateResized"];
}
