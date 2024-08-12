import Essentia, { IEssentia, VectorFloat, VectorVectorFloat } from "essentia.js";
import { EssentiaPointer, IEssentiaWorker } from "./EssentiaWorker.types";
import ProxyWorker from "../../workers/ProxyWorker";
import VectorImageProcessor, { VectorResizeOptions } from "../../core/VectorImageProcessor";
import MatrixImageProcessor, { MatrixResizeOptions } from "../../core/MatrixImageProcessor";

class Worker extends ProxyWorker<IEssentiaWorker> implements IEssentiaWorker {
    _essentia: IEssentia;
    private $vectorFloatMap: (VectorFloat | VectorVectorFloat)[] = [];
    private $2o<T extends VectorFloat | VectorVectorFloat = VectorFloat>($: EssentiaPointer): T {
        return this.$vectorFloatMap[$.$] as T;
    }
    private o2$(o: VectorFloat | VectorVectorFloat) {
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
        const { VectorFloat, VectorVectorFloat } = Essentia.EssentiaWASM.EssentiaWASM;
        const algorithmNames = Object.keys(Object.getPrototypeOf(essentia));
        for (const algo of algorithmNames) {
            (this as any)[algo] = (...args: any[]) => {
                const r = (essentia as any)[algo](...args.map(a => a instanceof Float32Array ? essentia.arrayToVector(a) : this.isEssentiaPointer(a) ? this.$2o(a) : a));
                if (r instanceof VectorFloat) return this.o2$(r);
                if (r instanceof Object) {
                    for (const key in r) {
                        if (r[key] instanceof VectorFloat || r[key] instanceof VectorVectorFloat) r[key] = this.o2$(r[key]);
                    }
                }
                return r;
            };
        }
        this.arrayToVector = input => this.o2$(essentia.arrayToVector(input));
        this.vectorToArray = input => essentia.vectorToArray(this.$2o(input));
        this.arrayToVectorVector = (input) => {
            const vvf = new essentia.module.VectorVectorFloat();
            input.forEach(f => vvf.push_back(essentia.arrayToVector(f)));
            return this.o2$(vvf);
        };
        this.vectorVectorToArray = (input) => {
            const array = [];
            const vvf = this.$2o<VectorVectorFloat>(input);
            for (let i = 0; i < vvf.size(); i++) {
                array[i] = essentia.vectorToArray(vvf.get(i));
            }
            return array;
        };
        this.generateResizedVector = (vectors: Float32Array[] | EssentiaPointer[], audioSamplesPerFrame: number, options?: Partial<VectorResizeOptions>) => {
            return VectorImageProcessor.generateResized(vectors.map(v => this.isEssentiaPointer(v) ? this.vectorToArray(v) : v), audioSamplesPerFrame, options);
        };
        this.generateResizedMatrix = (matrices: Float32Array[][] | EssentiaPointer[], audioSamplesPerFrame: number, options?: Partial<MatrixResizeOptions>) => {
            return MatrixImageProcessor.generateResized(matrices.map(v => this.isEssentiaPointer(v) ? this.vectorVectorToArray(v) : v), audioSamplesPerFrame, options);
        };
    }
}

new Worker();
