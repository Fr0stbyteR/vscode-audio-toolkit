// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import HelloWorldPanel from "./panels/HelloWorldPanel";
import MainEditorProvider from './editors/MainEditor';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "audio-toolkit" is now active in the web extension host!');

	/*
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('audioToolkit.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from audio-toolkit in a web extension host!');
	});

	// Create the show hello world command
	const showHelloWorldCommand = vscode.commands.registerCommand("audioToolkit.showHelloWorld", () => {
	  	HelloWorldPanel.render(context.extensionUri);
	});
  

	context.subscriptions.push(disposable);
	*/
	const disposable = MainEditorProvider.register(context);
	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
