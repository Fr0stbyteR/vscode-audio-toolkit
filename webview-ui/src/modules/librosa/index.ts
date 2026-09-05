import BeatMarkers from "./BeatMarkers";
import NonSilentMarkers from "./NonSilentMarkers";
import OnsetMarkers from "./OnsetMarkers";
import Chroma from "./Chroma";
import MelSpectrogram from "./MelSpectrogram";
import Pitch from "./Pitch";
import Rms from "./Rms";
import SpectralCentroid from "./SpectralCentroid";

export default async () => [
    BeatMarkers,
    OnsetMarkers,
    NonSilentMarkers,
    Rms,
    SpectralCentroid,
    Pitch,
    MelSpectrogram,
    Chroma
];
