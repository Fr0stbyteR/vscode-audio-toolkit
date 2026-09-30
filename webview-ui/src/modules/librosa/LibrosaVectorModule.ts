import { AudioAnalysisResult } from "../../../../src/web/proxies/VSCodeAudioEditor.types";
import { VectorDataSlice } from "../../core/VectorImageProcessor";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import LibrosaAnalysisModule, { LibrosaVisualizationState } from "./LibrosaAnalysisModule";
import LibrosaVectorComponent from "./LibrosaVectorComponent";

export default abstract class LibrosaVectorModule<State extends LibrosaVisualizationState> extends LibrosaAnalysisModule<State> {
    public readonly Component = LibrosaVectorComponent;
    protected _dataSlices: VectorDataSlice[] | undefined;
    abstract readonly unit: string;
    get dataSlices() { return this._dataSlices; }
    protected hasData() { return !!this._dataSlices?.length; }
    protected consumeResult(result: AudioAnalysisResult) {
        if (!result.vectors?.length) throw new Error("Librosa returned no vector data.");
        const vectors = this.selectVectors(result).map(values => values instanceof Float32Array ? values : Float32Array.from(values));
        const hopLength = Number(result.metadata?.hopLength ?? 512);
        const audioSamplesPerSample = hopLength / result.sampleRate * this.audioEditor.sampleRate;
        this._dataSlices = [{
            startIndex: 0,
            endIndex: this.audioEditor.length,
            offsetFromSample: 0,
            audioSamplesPerSample,
            vectors,
            resizedVectors: VectorImageProcessor.generateResized(vectors, audioSamplesPerSample)
        }];
        this.onDataChange?.(this._dataSlices);
    }
    protected selectVectors(result: AudioAnalysisResult) { return [result.vectors![0]]; }
}
