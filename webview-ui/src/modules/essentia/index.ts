import LevelExtractor from "./LevelExtractor";
import LoudnessEBUR128 from "./LoudnessEBUR128";
import PitchYinProbabilistic from "./PitchYinProbabilistic";
import PitchMelodia from "./PitchMelodia";
import PredominantPitchMelodia from "./PredominantPitchMelodia";
import Vibrato from "./Vibrato";
import LowLevelSpectralEqloudExtractorModules from "./LowLevelSpectralEqloudExtractor";
import LowLevelSpectralExtractorModules from "./LowLevelSpectralExtractor";
import BeatTrackerDegara from "./BeatTrackerDegara";

export default async () => [
    BeatTrackerDegara,
    LevelExtractor,
    LoudnessEBUR128,
    ...LowLevelSpectralEqloudExtractorModules,
    ...LowLevelSpectralExtractorModules,
    PitchYinProbabilistic,
    PitchMelodia,
    PredominantPitchMelodia,
    Vibrato
];
