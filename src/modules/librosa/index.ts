import BeatMarkers from "./BeatMarkers";
import NonSilentMarkers from "./NonSilentMarkers";
import OnsetMarkers from "./OnsetMarkers";
import Chroma from "./Chroma";
import MelSpectrogram from "./MelSpectrogram";
import Pitch from "./Pitch";
import Rms from "./Rms";
import SpectralCentroid from "./SpectralCentroid";
import SpectralBandwidth from "./SpectralBandwidth";
import SpectralRolloff from "./SpectralRolloff";
import SpectralFlatness from "./SpectralFlatness";
import ZeroCrossingRate from "./ZeroCrossingRate";
import OnsetStrength from "./OnsetStrength";
import Mfcc from "./Mfcc";

export default async () => [
    BeatMarkers,
    OnsetMarkers,
    NonSilentMarkers,
    Rms,
    ZeroCrossingRate,
    OnsetStrength,
    SpectralCentroid,
    SpectralBandwidth,
    SpectralRolloff,
    SpectralFlatness,
    Pitch,
    MelSpectrogram,
    Chroma,
    Mfcc
];
