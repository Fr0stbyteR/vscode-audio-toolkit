import type { AudioAnalysisAlgorithm } from "../../types";

export interface SignalStatisticsFeature {
    algorithm: AudioAnalysisAlgorithm;
    name: string;
    unit: string;
    kind?: "matrix";
    options?: Record<string, number>;
    channels?: string[];
    help: string;
}

/** Independent backend DSP implementations inspired by the SInES feature inventory. */
export const SIGNAL_STATISTICS_FEATURES: SignalStatisticsFeature[] = [
    { algorithm: "peakAmplitude", name: "Peak amplitude", unit: "Amplitude", help: "Largest absolute sample in each frame." },
    { algorithm: "crestFactor", name: "Crest factor", unit: "Ratio", help: "Peak amplitude divided by RMS; silence is zero." },
    { algorithm: "rmsDb", name: "RMS level · dBFS", unit: "dBFS", help: "Digital RMS level, not calibrated sound pressure level." },
    { algorithm: "dcOffset", name: "DC offset", unit: "Amplitude", help: "Mean signed sample amplitude in each frame." },
    { algorithm: "timeSkewness", name: "Time skewness", unit: "Skewness", help: "Asymmetry of the sample amplitude distribution." },
    { algorithm: "timeKurtosis", name: "Time kurtosis", unit: "Excess kurtosis", help: "Excess kurtosis of samples; a Gaussian distribution has value zero." },
    { algorithm: "temporalCentroid", name: "Temporal centroid", unit: "Ratio", help: "Energy-weighted position within each frame, normalized from zero to one." },
    { algorithm: "spectralTilt", name: "Spectral tilt", unit: "dB", options: { splitFrequency: 1000 }, help: "Energy below the split frequency divided by energy above it, in dB." },
    { algorithm: "spectralSlope", name: "Spectral slope", unit: "dB/oct", options: { fmin: 20, fmax: 10000 }, help: "Regression of spectral amplitude in dB against log2 frequency." },
    { algorithm: "spectralDecrease", name: "Spectral decrease", unit: "Ratio", help: "Frequency-weighted amplitude decrease relative to the first non-DC bin." },
    { algorithm: "spectralSmoothness", name: "Spectral smoothness", unit: "dB", help: "Mean absolute second difference of the log-amplitude spectrum." },
    { algorithm: "spectralIrregularityJensen", name: "Spectral irregularity · Jensen", unit: "Ratio", help: "Squared adjacent spectral differences divided by squared spectral amplitudes." },
    { algorithm: "spectralIrregularityKrimphoff", name: "Spectral irregularity · Krimphoff", unit: "Amplitude", help: "Sum of absolute deviations from the three-bin local spectral mean." },
    { algorithm: "positiveSpectralFlux", name: "Positive spectral flux", unit: "Flux", help: "L2 change of normalized spectral amplitudes, retaining increases only." },
    { algorithm: "spectralTonality", name: "Spectral tonality · flatness", unit: "Ratio", help: "Flatness-derived tonality proxy, not harmonic or musical key confidence." },
    { algorithm: "harmonicNoiseRatio", name: "Harmonic-to-noise ratio · estimated", unit: "dB", options: { frameLength: 4096, fmin: 60, fmax: 2000 }, help: "Autocorrelation HNR estimate for isolated voices or instruments, not polyphonic source separation." },
    { algorithm: "formants", name: "Formants · LPC estimate", unit: "Hz", options: { frameLength: 2048, lpcOrder: 16, fmin: 90, fmax: 5000, preEmphasis: .97, maximumBandwidth: 700 }, channels: ["F1", "F2", "F3"], help: "Three LPC resonance candidates; zero means no estimate. Best for isolated voices or instruments." },
    { algorithm: "lpcc", name: "LPCC", unit: "Coefficient", kind: "matrix", options: { lpcOrder: 16, coefficients: 13, preEmphasis: .97 }, help: "Linear prediction cepstral coefficients; first displayed coefficient is c1." },
    ...(["Vassilakis", "Sethares", "PlompLevelt"] as const).map(model => ({
        algorithm: `roughness${model}` as AudioAnalysisAlgorithm,
        name: `Roughness · ${model === "PlompLevelt" ? "Plomp & Levelt" : model}`, unit: "Roughness index",
        options: { frameLength: 4096, maxPeaks: 80, peakThresholdDb: -40, smoothingFrames: 1 },
        help: "Spectral-pair roughness with normalized digital amplitudes; a relative index, not calibrated Asper."
    })),
    ...(["Zwicker", "Aures", "DanielWeber"] as const).map(model => ({
        algorithm: `roughness${model}` as AudioAnalysisAlgorithm,
        name: `Roughness · ${model === "DanielWeber" ? "Daniel / Weber" : model} · estimated`, unit: "Roughness index",
        options: { frameLength: 4096, modulationWindowSeconds: .4, referenceLevelDb: 120, smoothingFrames: 1 },
        help: "Bark-band modulation roughness estimate, not the complete psychoacoustic model or calibrated Asper."
    }))
];
