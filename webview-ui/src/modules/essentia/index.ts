import LevelExtractor from "./LevelExtractor";
import LoudnessEBUR128 from "./LoudnessEBUR128";
import PitchYinProbabilistic from "./PitchYinProbabilistic";
import PitchMelodia from "./PitchMelodia";

export default async () => [
    LoudnessEBUR128,
    LevelExtractor,
    PitchYinProbabilistic,
    PitchMelodia
];
