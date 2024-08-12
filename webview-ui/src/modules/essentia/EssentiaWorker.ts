import Worker from "./EssentiaWorker.worker?worker&inline";
import { IEssentiaWorker } from "./EssentiaWorker.types";
import ProxyMain from "../../workers/ProxyMain";

export default class EssentiaWorker extends ProxyMain<{}, IEssentiaWorker> {
    static Worker = Worker;
    static fnNames: (keyof IEssentiaWorker)[] = [
        "LevelExtractor",
        "LoudnessEBUR128",
        "LowLevelSpectralExtractor",
        "PitchMelodia",
        "PitchYinProbabilistic",
        "PredominantPitchMelodia",
        "Vibrato",
        "generateResizedVector",
        "generateResizedMatrix",
        "vectorToArray",
        "arrayToVector"
    ];
}
