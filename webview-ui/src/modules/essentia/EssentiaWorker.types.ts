import { IEssentia, VectorFloat, VectorVectorFloat } from "essentia.js";
import { ResizedVectors, VectorResizeOptions } from "../../core/VectorImageProcessor";
import { MatrixResizeOptions, ResizedMatrices } from "../../core/MatrixImageProcessor";

export interface EssentiaPointer {
    __ESSENTIA_POINTER: boolean;
    $: number;
}

export type ArrayWithVectorToArray<A> = A extends Array<any> ? { [K in keyof A]: A[K] extends VectorFloat ? Float32Array | EssentiaPointer : A[K] extends VectorVectorFloat ? Float32Array[] | EssentiaPointer : A[K] } : A;
export type ObjectWithVectorToArray<O> = O extends Object ? { [K in keyof O]: O[K] extends VectorFloat ? EssentiaPointer : O[K] extends VectorVectorFloat ? EssentiaPointer : O[K] } : O;
export type FunctionWithVectorToArray<F extends (...args: any[]) => any> = (...args: ArrayWithVectorToArray<Parameters<F>>) => ReturnType<F> extends VectorFloat | VectorVectorFloat ? EssentiaPointer : ReturnType<F> extends Object ? ObjectWithVectorToArray<ReturnType<F>> : ReturnType<F>;

export type InterfaceWithVectorToArray<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? FunctionWithVectorToArray<T[K]> : T[K];
};

export interface IEssentiaWorker extends InterfaceWithVectorToArray<Omit<IEssentia, "arrayToVector" | "vectorToArray">> {
    generateResizedVector(vectors: Float32Array[] | EssentiaPointer[], audioSamplesPerFrame: number, options?: Partial<VectorResizeOptions>): ResizedVectors;
    generateResizedMatrix(matrices: Float32Array[][] | EssentiaPointer[], audioSamplesPerFrame: number, options?: Partial<MatrixResizeOptions>): ResizedMatrices;
    arrayToVector(input: Float32Array): EssentiaPointer;
    vectorToArray(input: EssentiaPointer): Float32Array;
    arrayToVectorVector(input: Float32Array[]): EssentiaPointer;
    vectorVectorToArray(input: EssentiaPointer): Float32Array[];
}
