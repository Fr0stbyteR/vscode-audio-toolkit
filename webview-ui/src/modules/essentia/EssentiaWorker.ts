import Worker from "./EssentiaWorker.worker?worker&inline";
import { IEssentiaWorker } from "./EssentiaWorker.types";
import ProxyMain from "../../workers/ProxyMain";

export default class EssentiaWorker extends ProxyMain<{}, IEssentiaWorker> {
    static Worker = Worker;
    static fnNames: (keyof IEssentiaWorker)[] = [
        "BeatTrackerDegara",
        "BeatTrackerMultiFeature",
        "LevelExtractor",
        "LoudnessEBUR128",
        "LowLevelSpectralExtractor",
        "LowLevelSpectralEqloudExtractor",
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
