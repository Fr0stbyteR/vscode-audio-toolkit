import Worker from "./EssentiaWorker.worker?worker&inline";
import { IEssentiaWorker } from "./EssentiaWorker.types";
import ProxyMain from "../../workers/ProxyMain";

export default class EssentiaWorker extends ProxyMain<{}, IEssentiaWorker> {
    static Worker = Worker;
    static fnNames: (keyof IEssentiaWorker)[] = [
        "LoudnessEBUR128",
        "LevelExtractor",
        "generateResizedVector",
        "vectorToArray",
        "arrayToVector"
    ];
}
