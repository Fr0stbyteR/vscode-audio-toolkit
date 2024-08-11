import Essentia from "essentia.js";
import { EssentiaPointer, IEssentiaWorker } from "./EssentiaWorker.types";
import ProxyWorker from "../../workers/ProxyWorker";
import VectorImageProcessor, { VectorResizeOptions } from "../../core/VectorImageProcessor";

class Worker extends ProxyWorker<IEssentiaWorker> implements IEssentiaWorker {
    _essentia: Essentia;
    private $vectorFloatMap: VectorFloat[] = [];
    private $2o($: EssentiaPointer) {
        return this.$vectorFloatMap[$.$];
    }
    private o2$(o: VectorFloat) {
        const i = this.$vectorFloatMap.indexOf(o);
        if (i !== -1) return { __ESSENTIA_POINTER: true, $: i };
        const $ = this.$vectorFloatMap.push(o) - 1;
        return { __ESSENTIA_POINTER: true, $ };
    }
    private isEssentiaPointer(o: any): o is EssentiaPointer {
        return typeof o === "object" && o.__ESSENTIA_POINTER && typeof o.$ === "number";
    }
    constructor() {
        super();
        const essentia = new Essentia.Essentia(Essentia.EssentiaWASM.EssentiaWASM);
        this._essentia = essentia;
        const { VectorFloat } = Essentia.EssentiaWASM.EssentiaWASM;
        const algorithmNames = Object.keys(Object.getPrototypeOf(essentia));
        for (const algo of algorithmNames) {
            (this as any)[algo] = (...args: any[]) => {
                const r = (essentia as any)[algo](...args.map(a => a instanceof Float32Array ? essentia.arrayToVector(a) : this.isEssentiaPointer(a) ? this.$2o(a) : a));
                if (r instanceof VectorFloat) return this.o2$(r);
                if (r instanceof Object) {
                    for (const key in r) {
                        if (r[key] instanceof VectorFloat) r[key] = this.o2$(r[key]);
                    }
                }
                return r;
            };
        }
        this.arrayToVector = input => this.o2$(essentia.arrayToVector(input));
        this.vectorToArray = input => essentia.vectorToArray(this.$2o(input));
        this.generateResizedVector = (vectors: Float32Array[] | EssentiaPointer[], audioSamplesPerFrame: number, options?: Partial<VectorResizeOptions>) => {
            return VectorImageProcessor.generateResized(vectors.map(v => this.isEssentiaPointer(v) ? essentia.vectorToArray(this.$2o(v)) : v), audioSamplesPerFrame, options);
        };
    }
}

new Worker();
