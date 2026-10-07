import { AudioAnalysisResult } from "../../types";
import MatrixImageProcessor, { MatrixDataSlice } from "../../core/MatrixImageProcessor";
import LibrosaAnalysisModule, { LibrosaVisualizationState } from "./LibrosaAnalysisModule";
import LibrosaMatrixComponent from "./LibrosaMatrixComponent";

export interface LibrosaMatrixVisualizationState extends LibrosaVisualizationState {
    colorMap: "spectrum" | "inferno" | "grayscale";
    colorMin: number;
    colorMax: number;
    opacity: number;
}

export default abstract class LibrosaMatrixModule<State extends LibrosaMatrixVisualizationState> extends LibrosaAnalysisModule<State> {
    public readonly Component = LibrosaMatrixComponent;
    protected _dataSlices: MatrixDataSlice[] | undefined;
    protected _valueRange: [number, number] = [0, 1];
    protected _analysisMetadata: AudioAnalysisResult["metadata"];
    get analysisMetadata() { return this._analysisMetadata; }
    abstract readonly unit: string;
    get dataSlices() { return this._dataSlices; }
    get valueRange() { return this._valueRange; }
    get valueUnit() { return this.unit; }
    get binLabels(): string[] | undefined { return undefined; }
    get bins() { return this._dataSlices?.[0].resizedMatrices.sizes[0][1] ?? 1; }
    protected hasData() { return !!this._dataSlices?.length; }
    protected consumeResult(result: AudioAnalysisResult) {
        if (!result.matrix?.length || !result.matrix[0]?.length) throw new Error(`${this.analysisEngine} returned no matrix data.`);
        this._analysisMetadata = result.metadata;
        // Convert incrementally and release the JSON rows as soon as possible. Keeping the
        // nested number arrays alive while allocating the Float32 copy can otherwise make a
        // several-minute Mel result briefly consume hundreds of MB in the webview.
        const rawMatrix = result.matrix;
        const matrix = new Array<Float32Array>(rawMatrix.length);
        for (let i = 0; i < rawMatrix.length; i++) {
            const row = rawMatrix[i];
            matrix[i] = row instanceof Float32Array ? row : Float32Array.from(row);
            rawMatrix[i] = [];
        }
        result.matrix = undefined;
        const hopLength = Number(result.metadata?.hopLength ?? 512);
        const audioSamplesPerFrame = hopLength / result.sampleRate * this.audioEditor.sampleRate * (result.duration > 0 ? this.audioEditor.duration / result.duration : 1);
        this._valueRange = [Number(result.metadata?.minValue ?? 0), Number(result.metadata?.maxValue ?? 1)];
        this._dataSlices = [{
            startIndex: 0,
            endIndex: this.audioEditor.length,
            resizedMatrices: MatrixImageProcessor.generateResized([matrix], audioSamplesPerFrame)
        }];
        this.onDataChange?.(this._dataSlices);
    }
}
