import { AudioToolkitModule, AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import WaveformComponent from "./WaveformComponent";
import WaveformWorker from "../../workers/WaveformWorker";
import AudioEditor from "../../core/AudioEditor";
import { VectorDataSlice } from "../../core/VectorImageProcessor";

export interface WaveformDrawOptions {
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

export interface WaveformState extends AudioToolkitModuleState {
}

class Waveform implements AudioToolkitModule<WaveformState> {
    static MODULE_ID = "waveform";
    static MODULE_NAME = "Waveform";
    static DEFAULT_STATE: WaveformState = { name: "" };
    static async fromAudioData(audioEditor: AudioEditor, initialState: Partial<WaveformState> = this.DEFAULT_STATE, sharableData?: Record<string, Promise<{ dataSlices?: VectorDataSlice[] } | null>>) {
        const waveform = new Waveform(audioEditor, { ...this.DEFAULT_STATE, ...initialState });
        const dataSlices = (await (sharableData?.[this.MODULE_ID]))?.dataSlices;
        if (dataSlices) {
            waveform._dataSlices = dataSlices;
        } else {
            waveform.calculate();
        }
        return waveform;
    }
    protected _isCalculating: boolean | [number, string] = false;
    get isCalculating() {
        return this._isCalculating;
    }
    protected set isCalculating(b: boolean | [number, string]) {
        this._isCalculating = b;
        this.onCalculating?.(b);
    }
    public onStateChange: ((newState: WaveformState) => any) | undefined;
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
    public moduleId = Waveform.MODULE_ID;
    public Component = WaveformComponent;
    public state: WaveformState;
    private _worker = new WaveformWorker();
    private disposed = false;
    dispose() {
        this.disposed = true;
        this.onStateChange = this.onCalculating = this.onDataChange = undefined;
        this._worker.dispose();
        this._dataSlices = undefined;
    }
    private _dataSlices: VectorDataSlice[] | undefined;
    get dataSlices() {
        return this._dataSlices;
    }
    private _sharableData: Promise<{ dataSlices?: VectorDataSlice[] } | null> = Promise.resolve(null);
    get sharableData() {
        return this._sharableData;
    }
    private constructor(
        public audioEditor: AudioEditor,
        initialState: WaveformState
    ) {
        this.state = initialState;
    }
    protected async handleCalculate(calculation: (onUpdate: (increment: number, message: string) => any, onError: (error: string) => any) => any) {
        this._sharableData = new Promise(async (resolve) => {
            try {
                this.isCalculating = true;
                await calculation(this.onCalculationUpdate, this.onCalculationError);
                resolve({ dataSlices: this._dataSlices });
            } catch (error) {
                if (!this.disposed) {
                    this.onCalculationError?.((error as Error).toString());
                    console.error(error);
                }
                resolve(null);
            } finally {
                this.isCalculating = false;
            }
        });
    }
    calculate() {
        if (this.disposed) return;
        this.handleCalculate(async (onUpdate) => {
            onUpdate(0, "Generating image");
            const { timeDomainData, length } = this.audioEditor;
            const ds = await this._worker.generateResized(timeDomainData, { startIndex: 0, endIndex: length });
            if (this.disposed) return;
            this._dataSlices = [{ ...ds, vectors: timeDomainData }];
            onUpdate(100, "Done");
            this.onDataChange?.(this._dataSlices);
        });
    }

    getState() {
        return this.state;
    }
    setState(newState: WaveformState) {
        this.state = newState;
        this.onStateChange?.(newState);
    }
}

export default Waveform;
