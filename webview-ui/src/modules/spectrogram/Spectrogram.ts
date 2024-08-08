import { AudioToolkitModule, AudioToolkitModuleState, FrequencyDomainChannelData, VisualizationOptions, VisualizationStyleOptions } from "../../core/AudioToolkitModule";
import SpectrogramComponent from "./SpectrogramComponent";
import SpectrogramWorker from "../../workers/SpectrogramWorker";
import { getRuler, hslToRgb } from "../../utils";
import AudioEditor, { AudioEditorState } from "../../core/AudioEditor";
import { MatrixDataSlice } from "../../core/MatrixImageProcessor";

export interface SpectrogramSliceData extends MatrixDataSlice {
    /**
     * Frequency-domain data of each channels.
     */
    frequencyDomainData: FrequencyDomainChannelData[];
}

export interface SpectrogramState extends AudioToolkitModuleState {
    fftDrawThreshold: number;
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
    fftDrawThreshold: number;
    dataSlices: SpectrogramSliceData[];
}

class Spectrogram implements AudioToolkitModule<SpectrogramState> {
    static MAX_BITMAP_SIZE = 1024 * 1024;
    static DB_DRAW_THRESHOLD = -100;
    static MODULE_ID = "spectrogram";
    static MODULE_NAME = "Spectrogram";
    static DEFAULT_STATE: SpectrogramState = { fftDrawThreshold: this.DB_DRAW_THRESHOLD, name: "" };
    static async fromAudioData(audioEditor: AudioEditor, { fftDrawThreshold = this.DEFAULT_STATE.fftDrawThreshold, name = this.DEFAULT_STATE.name }: Partial<SpectrogramState> = this.DEFAULT_STATE, sharableData?: { spectrogram: SpectrogramSharableData }) {
        const spectrogram = new Spectrogram(audioEditor, { name, fftDrawThreshold });
        if (sharableData?.spectrogram?.dataSlices) {
            spectrogram._dataSlices = sharableData.spectrogram.dataSlices;
            if (fftDrawThreshold !== sharableData.spectrogram.fftDrawThreshold) spectrogram._dataSlices.forEach(ds => ds.resizedMatrices.resizes.forEach(rs => rs.imageBitmaps = []));
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
    public onStateChange: ((newState: SpectrogramState) => any) | undefined;
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
    public state: SpectrogramState;
    private _worker = new SpectrogramWorker();
    private _dataSlices: SpectrogramSliceData[] | undefined;
    get dataSlices() {
        return this._dataSlices;
    }
    private constructor(
        public audioEditor: AudioEditor,
        initialState: SpectrogramState
    ) {
        this.state = initialState;
    }
    protected async handleCalculate(calculation: (onUpdate: (increment: number, message: string) => any, onError: (error: string) => any) => any) {
        try {
            this.isCalculating = true;
            await calculation(this.onCalculationUpdate, this.onCalculationError);
        } catch (error) {
            this.onCalculationError?.((error as Error).toString());
            console.error(error);
        } finally {
            this.isCalculating = false;
        }
    }
    calculate() {
        this.handleCalculate(async (onUpdate) => {
            onUpdate(0, "Generating image");
            const { frequencyDomainData, configuration, length } = this.audioEditor;
            const resized = await this._worker.generateResized(frequencyDomainData, { ...configuration, startIndex: 0, endIndex: length });
            this._dataSlices = [resized];
            onUpdate(100, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }

    getState() {
        return this.state;
    }
    setState(newState: SpectrogramState) {
        this.state = newState;
        this.onStateChange?.(newState);
    }
    getSharableData() {
        return {
            ...this.state,
            dataSlices: this._dataSlices
        };
    }
    getBestResizes(targetSamplesPerPixel: number, targetHeight: number): [number, number][] {
        return this._dataSlices!.map(({ resizedMatrices: resizedSpectrograms }) => {
            const width = resizedSpectrograms.sizes.filter((_, i) => resizedSpectrograms.resizes[i].audioSamplesPerFrame < targetSamplesPerPixel).map((([w]) => w)).sort((a, b) => a - b)[0] ?? resizedSpectrograms.sizes[0][0];
            const height = resizedSpectrograms.sizes.filter(([w, h]) => w === width && h > targetHeight).map(([_, h]) => h).sort((a, b) => a - b)[0] ?? resizedSpectrograms.sizes[0][1];
            return [width, height];
        });
    }
}

export default Spectrogram;
