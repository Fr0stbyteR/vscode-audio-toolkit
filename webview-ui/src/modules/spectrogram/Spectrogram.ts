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

export interface State extends AudioToolkitModuleState {
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
    dataSlices: SpectrogramSliceData[] | undefined;
}

class Spectrogram implements AudioToolkitModule<State> {
    static MAX_BITMAP_SIZE = 1024 * 1024;
    static DB_DRAW_THRESHOLD = -100;
    static MODULE_ID = "spectrogram";
    static MODULE_NAME = "Spectrogram";
    static DEFAULT_STATE: State = {
        name: "",
        minDB: -100,
        maxDB: 0
    };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<State> = {}, sharableData?: Record<string, SpectrogramSharableData>) {
        const dataSlices = sharableData?.[this.MODULE_ID]?.dataSlices;
        const sharedState = sharableData?.[this.MODULE_ID]?.state;
        const state: State = { ...this.DEFAULT_STATE, ...initialState };
        const spectrogram = new Spectrogram(audioEditor, state);
        if (dataSlices) {
            spectrogram._dataSlices = dataSlices;
            const needCalculate = !sharedState || !["minDB", "maxDB"].every(k => (sharedState as any)[k] === (state as any)[k]);
            if (needCalculate) spectrogram._dataSlices.forEach(ds => ds.resizedMatrices.resizes.forEach(rs => rs.imageBitmaps = []));
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
    private constructor(
        public audioEditor: AudioEditor,
        initialState: State
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
    setState(newState: State) {
        const needCalculate = newState.maxDB !== this.state.maxDB || newState.minDB !== this.state.minDB;
        this.state = newState;
        if (needCalculate) this._dataSlices?.forEach(ds => ds.resizedMatrices.resizes.forEach(rs => rs.imageBitmaps = []));
        this.onStateChange?.(newState);
    }
    getSharableData(): SpectrogramSharableData {
        return {
            state: this.state,
            dataSlices: this._dataSlices
        };
    }
    getOptionsMetadata(): { [K in keyof State]: [string, ...any] } {
        return {
            name: ["Name"],
            minDB: ["Drawing range minimum (dB)", -256, 1, 256],
            maxDB: ["Drawing range maximum (dB)", -256, 1, 256]
        };
    }
}

export default Spectrogram;
