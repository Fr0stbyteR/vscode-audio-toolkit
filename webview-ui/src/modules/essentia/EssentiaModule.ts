import { FunctionComponent } from "react";
import { AudioToolkitModule, AudioToolkitModuleState, VisualizationOptions } from "../../core/AudioToolkitModule";
import AudioEditor from "../../core/AudioEditor";
import EssentiaWorker from "./EssentiaWorker";
import { EssentiaPointer } from "./EssentiaWorker.types";
import { VectorDataSlice } from "../../core/VectorImageProcessor";
import { MatrixDataSlice } from "../../core/MatrixImageProcessor";

export interface EssentiaModuleSharableData<Data = any, State = any> {
    essentiaWorker: EssentiaWorker;
    timeDomainVectors: EssentiaPointer[];
    dataSlices: Data | undefined;
    state: State;
}

export interface EssentiaVectorDataSlice extends VectorDataSlice {
    vectorsPointer: EssentiaPointer[];
}
export interface EssentiaMatrixDataSlice extends MatrixDataSlice {
    matricesPointer: EssentiaPointer[];
}

abstract class EssentiaModule<State extends AudioToolkitModuleState = any, EssentiaState extends Record<string, any> = any, Data extends any[] = any> implements AudioToolkitModule<State> {
    static MODULE_ID = "essentia.base";
    static MODULE_NAME = "Essentia Base";
    static DEFAULT_ESSENTIA_STATE: Record<string, any> = {};
    static DEFAULT_STATE: AudioToolkitModuleState = { name: "" };
    private static _essentiaWorker: EssentiaWorker;
    static get essentiaWorker() {
        if (!this._essentiaWorker) this._essentiaWorker = new EssentiaWorker();
        return this._essentiaWorker;
    }
    static getTimeDomainVectors(audioEditor: AudioEditor, sharableData?: Record<string, EssentiaModuleSharableData>) {
        if (sharableData) {
            const id = Object.keys(sharableData).find(id => id.startsWith("essentia."));
            if (id) return sharableData[id].timeDomainVectors;
        }
        return Promise.all(audioEditor.timeDomainData.map(array => this.essentiaWorker.arrayToVector(array)));
    }
    static resolveEssentiaWorker(sharableData?: Record<string, EssentiaModuleSharableData>) {
        if (sharableData) {
            const id = Object.keys(sharableData).find(id => id.startsWith("essentia."));
            if (id) this._essentiaWorker = sharableData[id].essentiaWorker;
        }
        return this.essentiaWorker;
    }
    protected _isCalculating: boolean | [number, string] = false;
    get isCalculating() {
        return this._isCalculating;
    }
    protected set isCalculating(b: boolean | [number, string]) {
        this._isCalculating = b;
        this.onCalculating?.(b);
    }
    protected _dataSlices: Data | undefined;
    get dataSlices(): Data | undefined {
        return this._dataSlices;
    }
    declare public state: State;

    declare onStateChange: ((newState: State) => any) | undefined;
    declare onCalculating: ((isCalculating: boolean | [number, string]) => any) | undefined;
    declare onDataChange: ((data: any) => any) | undefined;
    onCalculationUpdate = (increment: number, message: string) => {
        const { isCalculating } = this;
        this.isCalculating = isCalculating === false ? false : [isCalculating === true || isCalculating[0] < 0 ? increment : isCalculating[0] + increment, message];
    };
    onCalculationError = (error: string) => {
        // const { isCalculating } = this;
        this.isCalculating = [-Infinity, error]; // typeof isCalculating === "boolean" ? [0, error] : [isCalculating[0], error];
    };
    protected async handleCalculate(calculation: (onUpdate: (increment: number, message: string) => boolean | void, onError: (error: string) => any) => any) {
        try {
            this.isCalculating = true;
            await calculation(this.onCalculationUpdate, this.onCalculationError);
            this.isCalculating = false;
        } catch (error) {
            this.onCalculationError?.((error as Error).toString());
            console.error(error);
        }
    }
    get Component(): FunctionComponent<VisualizationOptions<any, any>> {
        throw new Error("Method not implemented.");
    };
    get moduleId() {
        return (this.constructor as typeof EssentiaModule).MODULE_ID;
    }
    get essentiaWorker() {
        return (this.constructor as typeof EssentiaModule).essentiaWorker;
    }
    constructor(
        public audioEditor: AudioEditor,
        protected timeDomainVectors: EssentiaPointer[]
    ) {
    }
    calculate() {
        throw new Error("Method not implemented.");
    }
    getState() {
        return this.state;
    }
    setState(newState: State) {
        const needCalculate = !this._dataSlices?.length || !Object.keys((this.constructor as typeof EssentiaModule).DEFAULT_ESSENTIA_STATE).every(k => (newState as any)[k] === (this.state as any)[k]);
        this.state = newState;
        this.onStateChange?.(newState);
        if (needCalculate) this.calculate();
    }
    getSharableData(): EssentiaModuleSharableData<Data, State> {
        return {
            timeDomainVectors: this.timeDomainVectors,
            essentiaWorker: this.essentiaWorker,
            dataSlices: this.dataSlices,
            state: this.state
        };
    }
    getEssentiaState(moduleState = this.state) {
        const state: Partial<EssentiaState> = {};
        Object.keys((this.constructor as typeof EssentiaModule).DEFAULT_ESSENTIA_STATE).forEach(k => (state as any)[k] = (moduleState as any)[k]);
        return state as EssentiaState;
    }
}

export default EssentiaModule;
