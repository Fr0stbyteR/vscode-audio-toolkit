import LevelExtractor from "./LevelExtractor";
import LoudnessEBUR128 from "./LoudnessEBUR128";
import PitchYinProbabilistic from "./PitchYinProbabilistic";
import PitchMelodia from "./PitchMelodia";
import PredominantPitchMelodia from "./PredominantPitchMelodia";
import Vibrato from "./Vibrato";
import LowLevelSpectralExtractor from "./LowLevelSpectralExtractor";

export default async () => [
    LevelExtractor,
    LoudnessEBUR128,
    LowLevelSpectralExtractor,
    PitchYinProbabilistic,
    PitchMelodia,
    PredominantPitchMelodia,
    Vibrato
];
