declare const EssentiaBase: typeof import("essentia.js/dist/core_api").default;
declare const EssentiaExtractor: typeof import("essentia.js/dist/extractor/extractor").default;
declare const EssentiaPlot: typeof import("essentia.js/dist/display/plot").EssentiaPlot;
declare class ClassHandle {
    get(arg0: any): any;
    push_back(arg0: any): any;
    resize(arg0: any, arg1: any): any;
    set(arg0: any, arg1: any): any;
    size(): number;
}
declare class VectorDouble extends ClassHandle {}
declare class VectorFloat extends ClassHandle {}
declare class VectorInt extends ClassHandle {}
declare class VectorString extends ClassHandle {}
declare class VectorVectorDouble extends ClassHandle {}
declare class VectorVectorFloat extends ClassHandle {}
declare const EssentiaWASM: {
    VectorDouble: typeof VectorDouble,
    VectorFloat: typeof VectorFloat,
    VectorInt: typeof VectorInt,
    VectorString: typeof VectorString,
    VectorVectorDouble: typeof VectorVectorDouble,
    VectorVectorFloat: typeof VectorVectorFloat
};
declare class Essentia extends EssentiaBase {
    arrayToVector(inputArray: Float32Array): VectorFloat;
    vectorToArray(inputVector: VectorFloat): Float32Array;
    LoudnessEBUR128(leftSignal: VectorFloat, rightSignal: VectorFloat, hopSize?: number, sampleRate?: number, startAtZero?: boolean): { momentaryLoudness: VectorFloat, shortTermLoudness: VectorFloat, integratedLoudness: number, loudnessRange: number };
    LevelExtractor(signal: VectorFloat, frameSize?: number, hopSize?: number): { loudness: VectorFloat };
    PitchMelodia(signal: VectorFloat, binResolution?: number, filterIterations?: number, frameSize?: number, guessUnvoiced?: boolean, harmonicWeight?: number, hopSize?: number, magnitudeCompression?: number, magnitudeThreshold?: number, maxFrequency?: number, minDuration?: number, minFrequency?: number, numberHarmonics?: number, peakDistributionThreshold?: number, peakFrameThreshold?: number, pitchContinuity?: number, referenceFrequency?: number, sampleRate?: number, timeContinuity?: number): { pitch: VectorFloat; pitchConfidence: VectorFloat };
    PitchYinProbabilistic(signal: VectorFloat, frameSize?: number, hopSize?: number, lowRMSThreshold?: number, outputUnvoiced?: string, preciseTime?: boolean, sampleRate?: number): { pitch: VectorFloat; voicedProbabilities: VectorFloat };
    PredominantPitchMelodia(signal: VectorFloat, binResolution?: number, filterIterations?: number, frameSize?: number, guessUnvoiced?: boolean, harmonicWeight?: number, hopSize?: number, magnitudeCompression?: number, magnitudeThreshold?: number, maxFrequency?: number, minDuration?: number, minFrequency?: number, numberHarmonics?: number, peakDistributionThreshold?: number, peakFrameThreshold?: number, pitchContinuity?: number, referenceFrequency?: number, sampleRate?: number, timeContinuity?: number, voiceVibrato?: boolean, voicingTolerance?: number): { pitch: VectorFloat; pitchConfidence: VectorFloat };
    Vibrato(pitch: VectorFloat, maxExtend?: number, maxFrequency?: number, minExtend?: number, minFrequency?: number, sampleRate?: number): { vibratoFrequency: VectorFloat; vibratoExtend: VectorFloat };
}
interface Essentia extends EssentiaClass {}
declare module "essentia.js" {
    export type {
        Essentia,
        VectorFloat,
        VectorVectorFloat
    };
    export default {
        Essentia,
        EssentiaExtractor,
        EssentiaPlot,
        EssentiaWASM: { EssentiaWASM }
    };
}