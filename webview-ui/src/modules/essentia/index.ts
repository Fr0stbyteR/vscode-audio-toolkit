import LevelExtractor from "./LevelExtractor";
import LoudnessEBUR128 from "./LoudnessEBUR128";
import PitchYinProbabilistic from "./PitchYinProbabilistic";

export default async () => [
    LoudnessEBUR128,
    LevelExtractor,
    PitchYinProbabilistic
];
