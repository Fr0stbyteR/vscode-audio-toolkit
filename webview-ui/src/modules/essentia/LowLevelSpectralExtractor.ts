import { IEssentia } from "essentia.js";
import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import EssentiaModule, { EssentiaMatrixDataSlice, EssentiaModuleSharableData, EssentiaVectorDataSlice } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./LowLevelSpectralExtractorComponent";

type R = ReturnType<IEssentia["LowLevelSpectralExtractor"]>;
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

class Module extends EssentiaModule<State, EssentiaState, DataSlice[]> {
    static MODULE_ID = "essentia.lowlevelspectralextractor";
    static MODULE_NAME = "Essentia LowLevelSpectralExtractor";
    static DEFAULT_ESSENTIA_STATE: EssentiaState = {
        frameSize: 2048,
        hopSize: 1024,
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_ESSENTIA_STATE,
        color: "#FFFFFF",
        paintFeature: "mfcc"
    };
    static FEATURES: (keyof R)[] = [
        "barkbands",
        "barkbands_kurtosis",
        "barkbands_skewness",
        "barkbands_spread",
        "hfc",
        "mfcc",
        "pitch",
        "pitch_instantaneous_confidence",
        "pitch_salience",
        "silence_rate_20dB",
        "silence_rate_30dB",
        "silence_rate_60dB",
        "spectral_complexity",
        "spectral_crest",
        "spectral_decrease",
        "spectral_energy",
        "spectral_energyband_low",
        "spectral_energyband_middle_low",
        "spectral_energyband_middle_high",
        "spectral_energyband_high",
        "spectral_flatness_db",
        "spectral_flux",
        "spectral_rms",
        "spectral_rolloff",
        "spectral_strongpeak",
        "zerocrossingrate",
        "inharmonicity",
        "tristimulus",
        "oddtoevenharmonicenergyratio"
    ];
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, EssentiaModuleSharableData<DataSlice[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const dataSlices = sharableData?.[this.MODULE_ID]?.dataSlices;
        const sharedState = sharableData?.[this.MODULE_ID]?.state;
        const state: State = { ...this.DEFAULT_STATE, ...initialState };
        const needCalculate = !sharedState || !Object.keys(this.DEFAULT_ESSENTIA_STATE).every(k => (sharedState as any)[k] === (state as any)[k]);
        const timeDomainVectors = await super.getTimeDomainVectors(audioEditor, sharableData);
        const module = new Module(audioEditor, timeDomainVectors, state);
        if (dataSlices && !needCalculate) {
            module._dataSlices = [...dataSlices];
        } else {
            module.calculate();
        }
        return module;
    }
    get Component() {
        return Component;
    }
    private constructor(
        public audioEditor: AudioEditor,
        protected timeDomainVectors: EssentiaPointer[],
        initialState: State
    ) {
        super(audioEditor, timeDomainVectors);
        this.state = initialState;
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
                const result = await essentiaWorker.LowLevelSpectralExtractor(timeDomainVectors[channel], frameSize, hopSize, sampleRate);
                if (channel === 0) {
                    keys = Object.keys(result) as any;
                    for (const key of keys) {
                        allPointers[key] = [];
                        if (key === "barkbands" || key === "mfcc" || key === "tristimulus") {
                            // allMatrices[key] = []; // new Array(numberOfChannels).fill(null).map(() => [])
                        } else {
                            allVectors[key] = [];
                        }
                    }
                }
                for (const key of keys) {
                    const pointer = result[key];
                    allPointers[key]![channel] = pointer;
                    if (key === "barkbands" || key === "mfcc" || key === "tristimulus") {
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
                ...Module.FEATURES
            ]
        };
    }
    verticalZoom = (() => {
        const nyquistZoom = 2 / (this.audioEditor.sampleRate / 2);
        return {
            ...Module.FEATURES.reduce<{ [K in keyof R]?: number }>((acc, cur) => {
                acc[cur] = 2;
                return acc;
            }, {}),
            barkbands: 1,
            barkbands_kurtosis: 2 / 2000,
            barkbands_skewness: 50,
            barkbands_spread: 2 / 100,
            hfc: 2 / 1000,
            mfcc: 1,
            spectral_complexity: 2 / 100,
            spectral_crest: 2 / 100,
            spectral_rolloff: nyquistZoom,
            spectral_strongpeak: 2 / 100,
            pitch: nyquistZoom,
            tristimulus: 1,
            oddtoevenharmonicenergyratio: 2 / 1000

        } as { [K in keyof R]: number };
    })();
    verticalOffset = (() => {
        return {
            ...Module.FEATURES.reduce<{ [K in keyof R]?: number }>((acc, cur) => {
                acc[cur] = 1;
                return acc;
            }, {}),
            barkbands: 0,
            barkbands_kurtosis: 0.99,
            barkbands_skewness: 0,
            mfcc: 0,
            tristimulus: 0
        } as { [K in keyof R]: number };
    })();
    horizontalRulerZoom = (() => {
        const nyquistZoom = 2 / (this.audioEditor.sampleRate / 2);
        return {
            ...Module.FEATURES.reduce<{ [K in keyof R]?: number }>((acc, cur) => {
                acc[cur] = 1;
                return acc;
            }, {}),
            barkbands: 2 / 27,
            mfcc: 2 / 13,
            tristimulus: 2 / 3
        } as { [K in keyof R]: number };
    })();
    horizontalRulerOffset = {
        ...Module.FEATURES.reduce<{ [K in keyof R]?: number }>((acc, cur) => {
            acc[cur] = 0;
            return acc;
        }, {}),
        barkbands: 1,
        mfcc: 1,
        tristimulus: 1
    } as { [K in keyof R]: number };
    horizontalRulerUnit = {
        ...Module.FEATURES.reduce<{ [K in keyof R]?: string }>((acc, cur) => {
            acc[cur] = "";
            return acc;
        }, {}),
        pitch: "Hz",
        spectral_rolloff: "Hz",
        barkbands: "band",
        mfcc: "coeff",
        tristimulus: ""
    } as { [K in keyof R]: string };
    matrixUnit = {
        barkbands: "",
        mfcc: "",
        tristimulus: ""
    };
    matrixPaintRange = {
        barkbands: [0, 1],
        mfcc: [-100, 100],
        tristimulus: [0, 1]
    };
}

export default Module;
