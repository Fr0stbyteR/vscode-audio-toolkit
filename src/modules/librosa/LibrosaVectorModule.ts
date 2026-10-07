import { AudioAnalysisResult } from "../../types";
import { VectorDataSlice } from "../../core/VectorImageProcessor";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import LibrosaAnalysisModule, { LibrosaVisualizationState } from "./LibrosaAnalysisModule";
import LibrosaVectorComponent from "./LibrosaVectorComponent";

export default abstract class LibrosaVectorModule<State extends LibrosaVisualizationState> extends LibrosaAnalysisModule<State> {
    public readonly Component = LibrosaVectorComponent;
    protected _dataSlices: VectorDataSlice[] | undefined;
    protected _analysisMetadata: AudioAnalysisResult["metadata"];
    abstract readonly unit: string;
    get dataSlices() { return this._dataSlices; }
    get analysisMetadata() { return this._analysisMetadata; }
    get channelLabels(): string[] | undefined { return undefined; }
    protected hasData() { return !!this._dataSlices?.length; }
    protected consumeResult(result: AudioAnalysisResult) {
        if (!result.vectors?.length) throw new Error(`${this.analysisEngine} returned no vector data.`);
        const vectors = this.selectVectors(result).map(values => values instanceof Float32Array ? values : Float32Array.from(values));
        this._analysisMetadata = result.metadata;
        const hopLength = Number(result.metadata?.hopLength ?? 512);
        const audioSamplesPerSample = hopLength / result.sampleRate * this.audioEditor.sampleRate * (result.duration > 0 ? this.audioEditor.duration / result.duration : 1);
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
