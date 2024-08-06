import { Essentia, VectorFloat } from "essentia.js";
import VectorImageProcessor, { ResizedVectors, VectorResizeOptions } from "../../core/VectorImageProcessor";

export interface EssentiaPointer {
    __ESSENTIA_POINTER: boolean;
    $: number;
}

export type ArrayWithVectorToArray<A> = A extends Array<any> ? { [K in keyof A]: A[K] extends VectorFloat ? Float32Array | EssentiaPointer : A[K] } : A;
export type ObjectWithVectorToArray<O> = O extends Object ? { [K in keyof O]: O[K] extends VectorFloat ? Float32Array : O[K] } : O;
export type FunctionWithVectorToArray<F extends (...args: any[]) => any> = (...args: ArrayWithVectorToArray<Parameters<F>>) => ReturnType<F> extends VectorFloat ? Float32Array : ReturnType<F> extends Object ? ObjectWithVectorToArray<ReturnType<F>> : ReturnType<F>;

export type InterfaceWithVectorToArray<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? FunctionWithVectorToArray<T[K]> : T[K];
};

export interface IEssentiaWorker extends InterfaceWithVectorToArray<Omit<Essentia, "arrayToVector" | "vectorToArray">> {
    generateResizedVector(vectors: Float32Array[] | EssentiaPointer[], audioSamplesPerFrame: number, options?: Partial<VectorResizeOptions>): ResizedVectors;
    arrayToVector(input: Float32Array): EssentiaPointer;
    vectorToArray(input: EssentiaPointer): Float32Array;
}
