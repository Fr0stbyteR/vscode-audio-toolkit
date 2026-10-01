import type { AudioAnalysisAlgorithm } from "../../types";

export interface EssentiaFeature {
    algorithm: AudioAnalysisAlgorithm;
    name: string;
    kind: "vector" | "matrix" | "marker";
    unit: string;
    valueUnit?: string;
    options?: Record<string, number>;
}

export const ESSENTIA_FEATURES: EssentiaFeature[] = [
    { algorithm: "rms", name: "RMS", kind: "vector", unit: "RMS" },
    { algorithm: "energy", name: "Energy", kind: "vector", unit: "Energy" },
    { algorithm: "loudness", name: "Loudness · Stevens", kind: "vector", unit: "Stevens" },
    { algorithm: "zeroCrossingRate", name: "Zero-crossing rate", kind: "vector", unit: "Rate" },
    { algorithm: "spectralCentroid", name: "Spectral centroid", kind: "vector", unit: "Hz" },
    { algorithm: "spectralRolloff", name: "Spectral rolloff", kind: "vector", unit: "Hz", options: { rollPercent: .85 } },
    { algorithm: "spectralFlatness", name: "Spectral flatness", kind: "vector", unit: "Ratio" },
    { algorithm: "spectralCrest", name: "Spectral crest", kind: "vector", unit: "Ratio" },
    { algorithm: "spectralFlux", name: "Spectral flux", kind: "vector", unit: "Flux" },
    { algorithm: "spectralEntropy", name: "Spectral entropy", kind: "vector", unit: "Entropy" },
    { algorithm: "spectralComplexity", name: "Spectral complexity", kind: "vector", unit: "Peaks" },
    { algorithm: "hfc", name: "High-frequency content", kind: "vector", unit: "HFC" },
    { algorithm: "spectralSpread", name: "Spectral spread", kind: "vector", unit: "Hz²" },
    { algorithm: "spectralSkewness", name: "Spectral skewness", kind: "vector", unit: "Skewness" },
    { algorithm: "spectralKurtosis", name: "Spectral kurtosis", kind: "vector", unit: "Kurtosis" },
    { algorithm: "dissonance", name: "Sensory dissonance", kind: "vector", unit: "Ratio" },
    { algorithm: "pitch", name: "Pitch · YIN FFT", kind: "vector", unit: "Hz", options: { frameLength: 4096, confidence: .6 } },
    { algorithm: "pitchConfidence", name: "Pitch confidence", kind: "vector", unit: "Confidence", options: { frameLength: 4096 } },
    { algorithm: "onsetStrength", name: "Onset strength", kind: "vector", unit: "Flux" },
    { algorithm: "melBands", name: "Mel bands", kind: "matrix", unit: "Mel band", valueUnit: "dB", options: { bands: 64 } },
    { algorithm: "barkBands", name: "Bark bands", kind: "matrix", unit: "Bark band", valueUnit: "dB", options: { bands: 27 } },
    { algorithm: "erbBands", name: "ERB bands", kind: "matrix", unit: "ERB band", valueUnit: "dB", options: { bands: 40 } },
    { algorithm: "mfcc", name: "MFCC", kind: "matrix", unit: "Coefficient", valueUnit: "MFCC", options: { bands: 40, coefficients: 20 } },
    { algorithm: "gfcc", name: "GFCC", kind: "matrix", unit: "Coefficient", valueUnit: "GFCC", options: { bands: 40, coefficients: 20 } },
    { algorithm: "hpcp", name: "Harmonic pitch-class profile", kind: "matrix", unit: "Pitch class", valueUnit: "Strength", options: { frameLength: 4096, tuning: 440 } },
    { algorithm: "onsets", name: "Onsets", kind: "marker", unit: "s" },
    { algorithm: "silenceRegions", name: "Silence regions", kind: "marker", unit: "s", options: { thresholdDb: -60, minimumDuration: .1 } },
    { algorithm: "pitchNotes", name: "Stable pitch regions · estimated", kind: "marker", unit: "s", options: { frameLength: 4096, confidence: .8, minimumDuration: .12, tuning: 440 } },
    { algorithm: "keyRegions", name: "Key regions · estimated", kind: "marker", unit: "s", options: { frameLength: 4096, keyWindow: 8, confidence: .5, tuning: 440 } }
];
