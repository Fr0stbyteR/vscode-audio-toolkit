import * as vscode from "vscode";
import MainEditorProvider from "../web/editors/AudioEditor";
import { activate as activateShared, deactivate } from "../web/extension";
import LibrosaAnalysisService from "./LibrosaAnalysisService";

export function activate(context: vscode.ExtensionContext) {
    MainEditorProvider.setAnalysisService(new LibrosaAnalysisService(context.extensionUri));
    return activateShared(context);
}

export { deactivate };
