declare const EssentiaBase: typeof import("essentia.js/dist/core_api").default;
declare const EssentiaExtractor: typeof import("essentia.js/dist/extractor/extractor").default;
declare const EssentiaPlot: typeof import("essentia.js/dist/display/plot").EssentiaPlot;
declare const EssentiaWASM: any;
type VectorFloat = number;
declare class Essentia extends EssentiaBase {
    LoudnessEBUR128(leftSignal: VectorFloat, rightSignal: VectorFloat, hopSize?: number, sampleRate?: number, startAtZero?: boolean): { momentaryLoudness: VectorFloat, shortTermLoudness: VectorFloat, integratedLoudness: number, loudnessRange: number };
}
declare module "essentia.js" {
    export default {
        Essentia,
        EssentiaExtractor,
        EssentiaPlot,
        EssentiaWASM: { EssentiaWASM }
    };
}