import { FunctionComponent } from "react";
import Essentia from "essentia.js";
import { AudioToolkitModule, AudioToolkitModuleState, VisualizationOptions } from "../../core/AudioToolkitModule";
import AudioEditor from "../../core/AudioEditor";

export interface EssentiaModuleSharableData {
    timeDomainVectors: number[];
}

abstract class EssentiaModule<State extends AudioToolkitModuleState = any> implements AudioToolkitModule<State> {
    static MODULE_ID = "essentia.base";
    static MODULE_NAME = "Essentia Base";
    static DEFAULT_STATE: AudioToolkitModuleState = { name: "" };
    static essentia = new Essentia.Essentia(Essentia.EssentiaWASM.EssentiaWASM);
    static getTimeDomainVectors(audioEditor: AudioEditor, sharableData?: Record<string, EssentiaModuleSharableData>) {
        if (sharableData) {
            const id = Object.keys(sharableData).find(id => id.startsWith("essentia."));
            if (id) return sharableData[id].timeDomainVectors;
        }
        return audioEditor.timeDomainData.map(array => this.essentia.arrayToVector(array));
    }
    get Component(): FunctionComponent<VisualizationOptions<any, any>> {
        throw new Error("Method not implemented.");
    };
    get moduleId() {
        return (this.constructor as typeof EssentiaModule).MODULE_ID;
    }
    get essentia() {
        return (this.constructor as typeof EssentiaModule).essentia;
    }
    constructor(
        public audioEditor: AudioEditor,
        protected timeDomainVectors: number[]
    ) {
    }
    getState(): State {
        throw new Error("Method not implemented.");
    }
    setState(newState: State): void {
        throw new Error("Method not implemented.");
    }
    getSharableData() {
        return { timeDomainVectors: this.timeDomainVectors };
    }
    onStateChange: ((newState: State) => any) | undefined;

}

export default EssentiaModule;
