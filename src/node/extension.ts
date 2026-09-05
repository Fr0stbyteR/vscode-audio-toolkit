import * as vscode from "vscode";
import MainEditorProvider from "../web/editors/AudioEditor";
import { activate as activateShared, deactivate } from "../web/extension";
import LibrosaAnalysisService from "./LibrosaAnalysisService";

export function activate(context: vscode.ExtensionContext) {
    const analysisService = new LibrosaAnalysisService(context.extensionUri, context.globalStorageUri);
    MainEditorProvider.setAnalysisService(analysisService);
    context.subscriptions.push(vscode.commands.registerCommand("audioToolkit.clearAnalysisCache", async () => {
        try {
            const { files, bytes } = await analysisService.clearCache();
            const size = bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
            void vscode.window.showInformationMessage(files ? `Cleared ${files} cached analyses (${size}).` : "The audio analysis cache is already empty.");
        } catch (error) {
            void vscode.window.showErrorMessage(`Could not clear the audio analysis cache: ${(error as Error).message}`);
        }
    }));
    return activateShared(context);
}

export { deactivate };
