import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import EssentiaModule, { EssentiaModuleSharableData, EssentiaVectorDataSlice } from "./EssentiaModule";
import { EssentiaPointer } from "./EssentiaWorker.types";
import Component from "./PitchMelodiaComponent";

export interface EssentiaState {
    frameSize: number;
    hopSize: number;
    binResolution: number;
    filterIterations: number;
    guessUnvoiced: boolean;
    harmonicWeight: number;
    magnitudeCompression: number;
    magnitudeThreshold: number;
    minFrequency: number;
    maxFrequency: number;
    minDuration: number;
    numberHarmonics: number,
    peakDistributionThreshold: number;
    peakFrameThreshold: number;
    pitchContinuity: number;
    timeContinuity: number;
    referenceFrequency: number;
    voiceVibrato: boolean;
    voicingTolerance: number;
}

export interface State extends AudioToolkitModuleState, EssentiaState {
    color: string;
    confidenceColor: string;
    paintThreshold: number;
    paintConfidence: boolean;
    backgroundOpacity: number;
}

export interface DataSlice {
    pitch: EssentiaVectorDataSlice;
    pitchConfidence: EssentiaVectorDataSlice;
}

class Module extends EssentiaModule<State, EssentiaState, DataSlice[]> {
    static MODULE_ID = "essentia.predominantpitchmelodia";
    static MODULE_NAME = "Essentia PredominantPitchMelodia";
    static DEFAULT_ESSENTIA_STATE: EssentiaState = {
        frameSize: 2048,
        hopSize: 128,
        binResolution: 10,
        filterIterations: 3,
        guessUnvoiced: false,
        harmonicWeight: 0.8,
        magnitudeCompression: 1,
        magnitudeThreshold: 40,
        minFrequency: 40,
        maxFrequency: 20000,
        minDuration: 100,
        numberHarmonics: 20,
        peakDistributionThreshold: 0.9,
        peakFrameThreshold: 0.9,
        pitchContinuity: 27.5625,
        timeContinuity: 100,
        referenceFrequency: 55,
        voiceVibrato: false,
        voicingTolerance: 0.2
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_ESSENTIA_STATE,
        color: "#FFFFFF",
        confidenceColor: "#888888",
        paintThreshold: 0.01,
        paintConfidence: true,
        backgroundOpacity: 0.5
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, EssentiaModuleSharableData<DataSlice[]>>) {
        super.resolveEssentiaWorker(sharableData);
        const dataSlices = sharableData?.[this.MODULE_ID]?.dataSlices;
        const sharedState = sharableData?.[this.MODULE_ID]?.state;
        const state: State = { ...this.DEFAULT_STATE, pitchContinuity: audioEditor.sampleRate / 1600, ...initialState };
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
            const { binResolution, filterIterations, frameSize, guessUnvoiced, harmonicWeight, hopSize, magnitudeCompression, magnitudeThreshold, maxFrequency, minDuration, minFrequency, numberHarmonics, peakDistributionThreshold, peakFrameThreshold, pitchContinuity, referenceFrequency, timeContinuity, voiceVibrato, voicingTolerance } = this.state;
            const pitchVectors: Float32Array[] = [];
            const pitchVectorsPointer: EssentiaPointer[] = [];
            const confVectors: Float32Array[] = [];
            const confVectorsPointer: EssentiaPointer[] = [];
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const { pitch, pitchConfidence } = await essentiaWorker.PredominantPitchMelodia(timeDomainVectors[channel], binResolution, filterIterations, frameSize, guessUnvoiced, harmonicWeight, hopSize, magnitudeCompression, magnitudeThreshold, maxFrequency, minDuration, minFrequency, numberHarmonics, peakDistributionThreshold, peakFrameThreshold, pitchContinuity, referenceFrequency, sampleRate, timeContinuity, voiceVibrato, voicingTolerance);
                pitchVectorsPointer[channel] = pitch;
                pitchVectors[channel] = await essentiaWorker.vectorToArray(pitch);
                confVectorsPointer[channel] = pitchConfidence;
                confVectors[channel] = await essentiaWorker.vectorToArray(pitchConfidence);
                onUpdate(80 / numberOfChannels, channel === numberOfChannels - 1 ? "Generating image" : `Calculating channel ${channel + 2}`);
            }
            const audioSamplesPerSample = hopSize;
            const offsetFromSample = 0;
            let resizedVectors = await essentiaWorker.generateResizedVector(pitchVectorsPointer, audioSamplesPerSample);
            // resizedVectors.resizes.forEach(resize => resize.offsetFromFrame = offsetFromSample);
            const pitch: EssentiaVectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors: pitchVectors,
                vectorsPointer: pitchVectorsPointer,
                resizedVectors
            };
            resizedVectors = await essentiaWorker.generateResizedVector(confVectorsPointer, audioSamplesPerSample);
            const pitchConfidence: EssentiaVectorDataSlice = {
                startIndex: 0,
                endIndex: length,
                offsetFromSample,
                audioSamplesPerSample,
                vectors: confVectors,
                vectorsPointer: confVectorsPointer,
                resizedVectors
            };
            this._dataSlices = [{ pitch, pitchConfidence }];
            onUpdate(20, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }
    getOptionsMetadata(): { [K in keyof State]: [string, ...any] } {
        return {
            name: ["Name"],
            frameSize: ["Frame Size (samples)", 1, 1],
            hopSize: ["Hop Size (samples)", 1, 1],
            binResolution: ["Salience function bin resolution (cents)", 1, 1, 100],
            filterIterations: ["Filter iterations", 1, 1, 100],
            guessUnvoiced: ["Guess Unvoiced"],
            harmonicWeight: ["Harmonic Weight", 0.01, 0.01, 0.99],
            magnitudeCompression: ["Magnitude Compression", 0.01, 0.01, 1],
            magnitudeThreshold: ["Magnitude Threshold (dB)", 0, 0.1],
            minFrequency: ["Minimum Frequency (Hz)", 1, this.audioEditor.sampleRate / 2, 1],
            maxFrequency: ["Maximum Frequency (Hz)", 1, this.audioEditor.sampleRate / 2, 1],
            minDuration: ["Minimum allowed contour duration [ms]", 1, 1],
            numberHarmonics: ["Number of considered harmonics", 1, 1],
            peakDistributionThreshold: ["Peak distribution threshold (fraction of the standard deviation)", 0, 0.01, 2],
            peakFrameThreshold: ["Peak frame threshold (fraction of the highest peak salience in a frame)", 0, 0.01, 1],
            pitchContinuity: ["Pitch continuity (cents)", 0, 0.01],
            timeContinuity: ["Time continuity (ms)", 0.1, 0.1],
            referenceFrequency: ["Reference frequency corresponding to the 0th cent bin (Hz)", 1, 0.1],
            voiceVibrato: ["Detect Voice Vibrato"],
            voicingTolerance: ["Voicing Tolerance (fraction of the standard deviation)", -1, 0.01, 1.4],
            color: ["Color"],
            paintThreshold: ["Paint Voiced Threshold", 0.01, 0.01, 1],
            paintConfidence: ["Show Confidence"],
            confidenceColor: ["Confidence Color"],
            backgroundOpacity: ["Opacity of the spectrogram background (need module added)", 0, 0.01, 1]
        };
    }
}

export default Module;
