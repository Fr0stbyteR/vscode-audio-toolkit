import { FunctionComponent } from "react";
import { AudioToolkitModule, AudioToolkitModuleState, VisualizationOptions } from "../../core/AudioToolkitModule";
import AudioEditor from "../../core/AudioEditor";
import EssentiaWorker from "./EssentiaWorker";
import { EssentiaPointer } from "./EssentiaWorker.types";

export interface EssentiaModuleSharableData<Data = any> {
    essentiaWorker: EssentiaWorker;
    timeDomainVectors: EssentiaPointer[];
    dataSlices: Data;
}

abstract class EssentiaModule<State extends AudioToolkitModuleState = any, Data extends any = any> implements AudioToolkitModule<State> {
    static MODULE_ID = "essentia.base";
    static MODULE_NAME = "Essentia Base";
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

    declare onStateChange: ((newState: State) => any) | undefined;
    declare onCalculating: ((isCalculating: boolean | [number, string]) => any) | undefined;
    declare onDataChange: ((data: any) => any) | undefined;
    onCalculationUpdate = (increment: number, message: string) => {
        const { isCalculating } = this;
        this.isCalculating = isCalculating === false ? false : [isCalculating === true ? increment : isCalculating[0] + increment, message];
    };
    onCalculationError = (error: string) => {
        const { isCalculating } = this;
        this.isCalculating = typeof isCalculating === "boolean" ? [0, error] : [isCalculating[0], error];
    };
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
    getState(): State {
        throw new Error("Method not implemented.");
    }
    setState(newState: State) {
        throw new Error("Method not implemented.");
    }
    getSharableData(): EssentiaModuleSharableData {
        return {
            timeDomainVectors: this.timeDomainVectors,
            essentiaWorker: this.essentiaWorker,
            dataSlices: this.dataSlices
        };
    }
}

export default EssentiaModule;
