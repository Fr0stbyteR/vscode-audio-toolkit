import { AudioAnalysisResult } from "../../../../src/web/proxies/VSCodeAudioEditor.types";
import MatrixImageProcessor, { MatrixDataSlice } from "../../core/MatrixImageProcessor";
import LibrosaAnalysisModule, { LibrosaVisualizationState } from "./LibrosaAnalysisModule";
import LibrosaMatrixComponent from "./LibrosaMatrixComponent";

export default abstract class LibrosaMatrixModule<State extends LibrosaVisualizationState> extends LibrosaAnalysisModule<State> {
    public readonly Component = LibrosaMatrixComponent;
    protected _dataSlices: MatrixDataSlice[] | undefined;
    protected _valueRange: [number, number] = [0, 1];
    abstract readonly unit: string;
    get dataSlices() { return this._dataSlices; }
    get valueRange() { return this._valueRange; }
    get bins() { return this._dataSlices?.[0].resizedMatrices.sizes[0][1] ?? 1; }
    protected hasData() { return !!this._dataSlices?.length; }
    protected consumeResult(result: AudioAnalysisResult) {
        if (!result.matrix?.length || !result.matrix[0]?.length) throw new Error("Librosa returned no matrix data.");
        // Convert incrementally and release the JSON rows as soon as possible. Keeping the
        // nested number arrays alive while allocating the Float32 copy can otherwise make a
        // several-minute Mel result briefly consume hundreds of MB in the webview.
        const rawMatrix = result.matrix;
        const matrix = new Array<Float32Array>(rawMatrix.length);
        for (let i = 0; i < rawMatrix.length; i++) {
            matrix[i] = Float32Array.from(rawMatrix[i]);
            rawMatrix[i] = [];
        }
        result.matrix = undefined;
        const hopLength = Number(result.metadata?.hopLength ?? 512);
        const audioSamplesPerFrame = hopLength / result.sampleRate * this.audioEditor.sampleRate;
        this._valueRange = [Number(result.metadata?.minValue ?? 0), Number(result.metadata?.maxValue ?? 1)];
        this._dataSlices = [{
            startIndex: 0,
            endIndex: this.audioEditor.length,
            resizedMatrices: MatrixImageProcessor.generateResized([matrix], audioSamplesPerFrame)
        }];
        this.onDataChange?.(this._dataSlices);
    }
}
