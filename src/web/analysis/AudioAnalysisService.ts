import * as vscode from "vscode";
import { AudioAnalysisRequest, AudioAnalysisResult } from "../proxies/VSCodeAudioEditor.types";

export interface AudioAnalysisService {
    analyze(uri: vscode.Uri, request: AudioAnalysisRequest): Promise<AudioAnalysisResult>;
    dispose?(): void;
}
