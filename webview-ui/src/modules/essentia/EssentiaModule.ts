import { FunctionComponent } from "react";
import { AudioToolkitModule, AudioToolkitModuleState, VisualizationOptions } from "../../core/AudioToolkitModule";
import AudioEditor from "../../core/AudioEditor";
import EssentiaWorker from "./EssentiaWorker";
import { EssentiaPointer } from "./EssentiaWorker.types";

export interface EssentiaModuleSharableData {
    timeDomainVectors: EssentiaPointer[];
}

abstract class EssentiaModule<State extends AudioToolkitModuleState = any> implements AudioToolkitModule<State> {
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
    getSharableData() {
        return { timeDomainVectors: this.timeDomainVectors };
    }
    onStateChange: ((newState: State) => any) | undefined;

}

export default EssentiaModule;
