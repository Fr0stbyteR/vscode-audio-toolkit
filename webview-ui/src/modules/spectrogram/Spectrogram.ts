import { AudioToolkitModule, AudioToolkitModuleState, FrequencyDomainChannelData, VisualizationOptions, VisualizationStyleOptions } from "../../core/AudioToolkitModule";
import SpectrogramComponent from "./SpectrogramComponent";
import SpectrogramWorker from "../../workers/SpectrogramWorker";
import AudioEditor from "../../core/AudioEditor";
import { MatrixDataSlice } from "../../core/MatrixImageProcessor";
import STFTWorker from "../../workers/STFTWorker";

export interface SpectrogramSliceData extends MatrixDataSlice {
    /**
     * Frequency-domain data of each channels.
     */
    frequencyDomainData: FrequencyDomainChannelData[];
}

export interface CalculationState {
    fftSize: number,
    fftOverlap: number,
    fftWindowFunction: string,
}

export interface State extends AudioToolkitModuleState, CalculationState {
    minDB: number;
    maxDB: number;
}

export interface SpectrogramDrawOptions {
    width: number;
    height: number;
    verticalZoom: number;
    verticalOffset: number;
    gridLabels: boolean;
    fadeInExp: number;
    fadeInTo: number;
    fadeOutExp: number;
    fadeOutFrom: number;
    fade: number;
}

interface SpectrogramSharableData {
    state: State;
    frequencyDomainData: FrequencyDomainChannelData[] | undefined;
    dataSlices: SpectrogramSliceData[] | undefined;
}

class Spectrogram implements AudioToolkitModule<State> {
    static MAX_BITMAP_SIZE = 1024 * 1024;
    static MODULE_ID = "spectrogram";
    static MODULE_NAME = "Spectrogram";
    static DEFAULT_CALCULATION_STATE: CalculationState = {
        fftSize: 1024,
        fftOverlap: 2,
        fftWindowFunction: "blackmanHarris"
    };
    static DEFAULT_STATE: State = {
        name: "",
        ...this.DEFAULT_CALCULATION_STATE,
        minDB: -100,
        maxDB: 0
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, Promise<SpectrogramSharableData>>) {
        const stftWorker = new STFTWorker();
        await stftWorker.init();
        const dataSlices = (await sharableData?.[this.MODULE_ID])?.dataSlices;
        const sharedState = (await sharableData?.[this.MODULE_ID])?.state;
        const state: State = { ...this.DEFAULT_STATE, ...initialState };
        const needCalculate = !sharedState || !Object.keys(this.DEFAULT_CALCULATION_STATE).every(k => (sharedState as any)[k] === (state as any)[k]);
        const spectrogram = new Spectrogram(audioEditor, stftWorker, state);
        if (dataSlices && !needCalculate) {
            spectrogram._dataSlices = [...dataSlices];
            const needNewBitmaps = !sharedState || !["minDB", "maxDB"].every(k => (sharedState as any)[k] === (state as any)[k]);
            if (needNewBitmaps) spectrogram._dataSlices = spectrogram._dataSlices.map(ds => ({ ...ds, resizedMatrices: { ...ds.resizedMatrices, resizes: ds.resizedMatrices.resizes.map(rs => ({ ...rs, imageBitmaps: [] }))} }));
        } else {
            spectrogram.calculate();
        }
        return spectrogram;
    }
    protected _isCalculating: boolean | [number, string] = false;
    get isCalculating() {
        return this._isCalculating;
    }
    protected set isCalculating(b: boolean | [number, string]) {
        this._isCalculating = b;
        this.onCalculating?.(b);
    }
    public onStateChange: ((newState: State) => any) | undefined;
    public onCalculating: ((isCalculating: boolean | [number, string]) => any) | undefined;
    public onDataChange: ((data: any) => any) | undefined;
    onCalculationUpdate = (increment: number, message: string) => {
        const { isCalculating } = this;
        this.isCalculating = isCalculating === false ? false : [isCalculating === true ? increment : isCalculating[0] + increment, message];
    };
    onCalculationError = (error: string) => {
        const { isCalculating } = this;
        this.isCalculating = typeof isCalculating === "boolean" ? [0, error] : [isCalculating[0], error];
    };
    public moduleId = Spectrogram.MODULE_ID;
    public Component = SpectrogramComponent;
    public state: State;
    private _worker = new SpectrogramWorker();
    private _dataSlices: SpectrogramSliceData[] | undefined;
    get dataSlices() {
        return this._dataSlices;
    }
    private _sharableData: Promise<SpectrogramSharableData | null> = Promise.resolve(null);
    get sharableData() {
        return this._sharableData;
    }
    private _frequencyDomainData: FrequencyDomainChannelData[] | undefined;
    get frequencyDomainData() {
        return this._frequencyDomainData;
    }

    private constructor(
        public audioEditor: AudioEditor,
        private stftWorker: STFTWorker,
        initialState: State
    ) {
        this.state = initialState;
    }
    protected async handleCalculate(calculation: (onUpdate: (increment: number, message: string) => any, onError: (error: string) => any) => any) {
        this._sharableData = new Promise(async (resolve) => {
            try {
                this.isCalculating = true;
                await calculation(this.onCalculationUpdate, this.onCalculationError);
                resolve({
                    state: this.state,
                    frequencyDomainData: this._frequencyDomainData,
                    dataSlices: this._dataSlices
                });
            } catch (error) {
                this.onCalculationError?.((error as Error).toString());
                console.error(error);
                resolve(null);
            } finally {
                this.isCalculating = false;
            }
        });
    }
    calculate() {
        this.handleCalculate(async (onUpdate) => {
            onUpdate(0, "Calculating channel 1");
            const { timeDomainData, numberOfChannels, length } = this.audioEditor;
            const frequencyDomainData: FrequencyDomainChannelData[] = [];
            for (let channel = 0; channel < numberOfChannels; channel++) {
                frequencyDomainData[channel] = await this.stftWorker.stft(timeDomainData[channel], { ...this.state });
                onUpdate(80 / numberOfChannels, channel === numberOfChannels - 1 ? "Generating image" : `Calculating channel ${channel + 2}`);
            }
            this._frequencyDomainData = frequencyDomainData;
            const resized = await this._worker.generateResized(frequencyDomainData, { ...this.state, startIndex: 0, endIndex: length });
            this._dataSlices = [resized];
            onUpdate(20, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }

    getCalculationState(moduleState = this.state) {
        const state: Partial<CalculationState> = {};
        Object.keys(Spectrogram.DEFAULT_CALCULATION_STATE).forEach(k => (state as any)[k] = (moduleState as any)[k]);
        return state as CalculationState;
    }
    getState() {
        return this.state;
    }
    setState(newState: State) {
        const needCalculate = !Object.keys(Spectrogram.DEFAULT_CALCULATION_STATE).every(k => (newState as any)[k] === (this.state as any)[k]);
        if (!this._dataSlices || needCalculate) {
            this.state = newState;
            this.onStateChange?.(newState);
            this.calculate();
            return;
        }
        const needNewBitmaps = newState.maxDB !== this.state.maxDB || newState.minDB !== this.state.minDB;
        this.state = newState;
        if (needNewBitmaps) this._dataSlices = this._dataSlices.map(ds => ({ ...ds, resizedMatrices: { ...ds.resizedMatrices, resizes: ds.resizedMatrices.resizes.map(rs => ({ ...rs, imageBitmaps: [] }))} }));
        this.onStateChange?.(newState);
    }
    getOptionsMetadata(): { [K in keyof State]: [string, ...any] } {
        return {
            name: ["Name"],
            fftSize: ["FFT window size", 64, 1],
            fftOverlap: ["FFT window overlaps", 2, 1],
            fftWindowFunction: [
                "FFT window function",
                "rectangular",
                "bartlett",
                "bartlettHann",
                "blackman",
                "blackmanHarris",
                "blackmanNuttall",
                "cosine",
                "exactBlackman",
                "flatTop",
                "hamming",
                "hann",
                "lanczoz",
                "nuttall",
                "triangular",
                "welch"
            ],
            minDB: ["Drawing range minimum (dB)", -256, 1, 256],
            maxDB: ["Drawing range maximum (dB)", -256, 1, 256]
        };
    }
}

export default Spectrogram;
