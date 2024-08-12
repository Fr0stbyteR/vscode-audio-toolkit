import { IEssentia } from "essentia.js";
import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import EssentiaModule, { EssentiaMatrixDataSlice, EssentiaModuleSharableData, EssentiaVectorDataSlice } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./LowLevelSpectralExtractorComponent";

type R = ReturnType<IEssentia["LowLevelSpectralEqloudExtractor"]>;
export type DataSlice = {
    [K in keyof R]: EssentiaMatrixDataSlice | EssentiaVectorDataSlice;
};

export interface EssentiaState {
    frameSize: number;
    hopSize: number;
}

export interface State extends AudioToolkitModuleState, EssentiaState {
    color: string;
    paintFeature: keyof R
}

const FEATURE_IDS: (keyof R)[] = [
    "dissonance",
    "sccoeffs",
    "scvalleys",
    "spectral_centroid",
    "spectral_kurtosis",
    "spectral_skewness",
    "spectral_spread"
];
const FEATURE_NAMES_MAP = {
    ...FEATURE_IDS.reduce<Partial<Record<keyof R, string>>>((acc, cur) => {
        acc[cur] = cur.split("_").map(s => `${s[0].toUpperCase()}${s.slice(1)}`).join(" ");
        return acc;
    }, {}),
    sccoeffs: "Spectral Contrast Coefficients",
    scvalleys: "Spectral Contrast Valleys",
    
} as Record<keyof R, string>;

export class LowLevelSpectralEqloudExtractorModule extends EssentiaModule<State, EssentiaState, DataSlice[]> {
    static MODULE_ID = "essentia.lowlevelspectraleqloudextractor";
    static MODULE_NAME = "Essentia LowLevelSpectralEqloudExtractor";
    static DEFAULT_ESSENTIA_STATE: EssentiaState = {
        frameSize: 2048,
        hopSize: 1024,
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_ESSENTIA_STATE,
        color: "#FFFFFF",
        paintFeature: "spectral_centroid"
    };
    static FEATURES = FEATURE_IDS;
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, EssentiaModuleSharableData<DataSlice[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const state: State = { ...this.DEFAULT_STATE, ...initialState };
        const sharableModuleId = sharableData ? Object.keys(sharableData).find((k) => {
            if (!k.startsWith(LowLevelSpectralEqloudExtractorModule.MODULE_ID)) return false;
            if (!sharableData[k]?.dataSlices) return false;
            const sharedState = sharableData[k]?.state;
            if (!sharedState) return false;
            const needCalculate = !Object.keys(this.DEFAULT_ESSENTIA_STATE).every(k => (sharedState as any)[k] === (state as any)[k]);
            if (needCalculate) return false;
            return true;
        }) : undefined;
        const timeDomainVectors = await super.getTimeDomainVectors(audioEditor, sharableData);
        const module = new this(audioEditor, timeDomainVectors, state);
        if (sharableModuleId) {
            const dataSlices = sharableData![sharableModuleId]!.dataSlices!;
            module._dataSlices = [...dataSlices];
        } else {
            module.calculate();
        }
        return module;
    }
    get Component() {
        return Component;
    }
    protected constructor(
        public audioEditor: AudioEditor,
        protected timeDomainVectors: EssentiaPointer[],
        initialState: State
    ) {
        super(audioEditor, timeDomainVectors);
        this.state = initialState;
    }
    featureOutputsMatrix(key: keyof R) {
        return key === "sccoeffs" || key === "scvalleys";
    }
    calculate() {
        this.handleCalculate(async (onUpdate) => {
            onUpdate(0, "Calculating channel 1");
            const { timeDomainVectors, essentiaWorker } = this;
            const { sampleRate, length, numberOfChannels } = this.audioEditor;
            const { frameSize, hopSize } = this.state;
            const audioSamplesPerSample = hopSize;
            const offsetFromSample = 0;
            const dataSlice: Partial<DataSlice> = {};
            let keys: (keyof R)[] = [];
            const allVectors: { [K in keyof R]?: Float32Array[] } = {};
            const allPointers: { [K in keyof R]?: EssentiaPointer[] } = {};
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const result = await essentiaWorker.LowLevelSpectralEqloudExtractor(timeDomainVectors[channel], frameSize, hopSize, sampleRate);
                if (channel === 0) {
                    keys = Object.keys(result) as any;
                    for (const key of keys) {
                        allPointers[key] = [];
                        if (this.featureOutputsMatrix(key)) {
                            // allMatrices[key] = []; // new Array(numberOfChannels).fill(null).map(() => [])
                        } else {
                            allVectors[key] = [];
                        }
                    }
                }
                for (const key of keys) {
                    const pointer = result[key];
                    allPointers[key]![channel] = pointer;
                    if (this.featureOutputsMatrix(key)) {
                        // const matrix = await essentiaWorker.vectorVectorToArray(pointer);
                        // allMatrices[key]![channel] = matrix;
                    } else {
                        const vector = await essentiaWorker.vectorToArray(pointer);
                        allVectors[key]![channel] = vector;
                    }
                }
                onUpdate(80 / numberOfChannels, channel === numberOfChannels - 1 ? "Generating image" : `Calculating channel ${channel + 2}`);
            }
            for (const key of keys) {
                if (allPointers[key]) {
                    if (allVectors[key]) {
                        const vectors = allVectors[key];
                        const vectorsPointer = allPointers[key];
                        const resizedVectors = await essentiaWorker.generateResizedVector(vectorsPointer, audioSamplesPerSample);
                        (dataSlice as any)[key] = {
                            startIndex: 0,
                            endIndex: length,
                            offsetFromSample,
                            audioSamplesPerSample,
                            vectors,
                            vectorsPointer,
                            resizedVectors
                        } as EssentiaVectorDataSlice;
                    } else { // if (allMatrices[key]) {
                        // const matrices = allMatrices[key];
                        const matricesPointer = allPointers[key];
                        const resizedMatrices = await essentiaWorker.generateResizedMatrix(matricesPointer, audioSamplesPerSample);
                        (dataSlice as any)[key] = {
                            startIndex: 0,
                            endIndex: length,
                            resizedMatrices,
                            matricesPointer
                        } as EssentiaMatrixDataSlice;
                    }
                }
            }
            this._dataSlices = [dataSlice as DataSlice];
            onUpdate(20, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }
    getOptionsMetadata(): { [K in keyof State]: [string, ...any] } {
        return {
            name: ["Name"],
            frameSize: ["Frame Size (samples)", 1, 1],
            hopSize: ["Hop Size (samples)", 1, 1],
            color: ["Color"],
            paintFeature: [
                "Feature to paint",
                ...LowLevelSpectralEqloudExtractorModule.FEATURES
            ]
        };
    }
    verticalZoom = (() => {
        const nyquistZoom = 2 / (this.audioEditor.sampleRate / 2);
        return {
            ...LowLevelSpectralEqloudExtractorModule.FEATURES.reduce<{ [K in keyof R]?: number }>((acc, cur) => {
                acc[cur] = 2;
                return acc;
            }, {}),
            sccoeffs: 1,
            scvalleys: 1,
            spectral_centroid: nyquistZoom,
            spectral_kurtosis: 2 / 200,
            spectral_skewness: 2 / 50,
            spectral_spread: 2 / 1e8
        } as { [K in keyof R]: number };
    })();
    verticalOffset = (() => {
        return {
            ...LowLevelSpectralEqloudExtractorModule.FEATURES.reduce<{ [K in keyof R]?: number }>((acc, cur) => {
                acc[cur] = 1;
                return acc;
            }, {}),
            sccoeffs: 0,
            scvalleys: 0
        } as { [K in keyof R]: number };
    })();
    horizontalRulerZoom = (() => {
        const nyquistZoom = 2 / (this.audioEditor.sampleRate / 2);
        return {
            ...LowLevelSpectralEqloudExtractorModule.FEATURES.reduce<{ [K in keyof R]?: number }>((acc, cur) => {
                acc[cur] = 1;
                return acc;
            }, {}),
            sccoeffs: 2 / 6,
            scvalleys: 2 / 6
        } as { [K in keyof R]: number };
    })();
    horizontalRulerOffset = {
        ...LowLevelSpectralEqloudExtractorModule.FEATURES.reduce<{ [K in keyof R]?: number }>((acc, cur) => {
            acc[cur] = 0;
            return acc;
        }, {}),
        sccoeffs: 1,
        scvalleys: 1
    } as { [K in keyof R]: number };
    horizontalRulerUnit = {
        ...LowLevelSpectralEqloudExtractorModule.FEATURES.reduce<{ [K in keyof R]?: string }>((acc, cur) => {
            acc[cur] = "";
            return acc;
        }, {}),
        spectral_centroid: "Hz",
        sccoeffs: "",
        scvalleys: ""
    } as { [K in keyof R]: string };
    matrixUnit = {
        sccoeffs: "",
        scvalleys: ""
    };
    matrixPaintRange = {
        sccoeffs: [-1, 0],
        scvalleys: [-10, 0]
    };
}

const Modules = FEATURE_IDS.map((featureId) => {
    const featureName = FEATURE_NAMES_MAP[featureId];
    return class Module extends LowLevelSpectralEqloudExtractorModule {
        static MODULE_ID: string = `essentia.lowlevelspectralextractor.${featureId}`;
        static MODULE_NAME: string = `Essentia LowLevel ${featureName}`;
        static DEFAULT_STATE: State = {
            name: "",
            ...this.DEFAULT_ESSENTIA_STATE,
            color: "#FFFFFF",
            paintFeature: featureId
        };
    };
});

export default Modules;
