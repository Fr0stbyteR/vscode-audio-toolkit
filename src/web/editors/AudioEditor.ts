import * as vscode from "vscode";
import { getNonce, getUri, Disposable, WebviewCollection, disposeAll } from "../utils";
import VSCodeHostProxy from "../proxies/VSCodeHostProxy";
import { AudioEditorConfiguration, AudioToolkitEdit, IVSCodeAudioEditorHost, IVSCodeAudioEditorWebview, AudioToolkitModulesState } from "../proxies/VSCodeAudioEditor.types";

interface AudioDocumentDelegate {
	getFileData(): Promise<Uint8Array>;
}

class AudioDocument extends Disposable implements vscode.CustomDocument {
	static async create(uri: vscode.Uri, backupId: string | undefined) {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const audioFileUri = typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
		const editable = vscode.workspace.fs.isWritableFileSystem(uri.scheme);
		const isInWorkspace = uri.fsPath !== vscode.workspace.asRelativePath(uri);
		const jsonUri = isInWorkspace ? vscode.Uri.file(uri.fsPath.replace(/\.[^.]+$/, ".json")) : undefined;
		const audioData = audioFileUri.scheme === "untitled" ? new Uint8Array() : new Uint8Array(await vscode.workspace.fs.readFile(audioFileUri));
		let modulesState: AudioToolkitModulesState | null = null;
		if (jsonUri) {
			try {
				const buffer = await vscode.workspace.fs.readFile(jsonUri);
				const str = Buffer.from(buffer).toString("utf-8");
				modulesState = JSON.parse(str);
			} catch (error) {
				console.log(error);
			}
		}
		return new AudioDocument(uri, jsonUri, audioData, modulesState);
	}

	private _edits: Array<AudioToolkitEdit> = [];
	private _savedEdits: Array<AudioToolkitEdit> = [];

	private constructor(
		private readonly _uri: vscode.Uri,
		private _jsonUri: vscode.Uri | undefined,
		private readonly _audioData: Uint8Array,
		private _modulesState: AudioToolkitModulesState | null
		
	) {
		super();
	}

	public get uri() { return this._uri; }
	public get jsonUri() { return this._jsonUri; }
	public get audioData() { return this._audioData; }
	public get modulesState() { return this._modulesState; }

	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	/**
	 * Fired when the document is disposed of.
	 */
	public readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
		readonly content: AudioToolkitModulesState | null;
		readonly edits: readonly AudioToolkitEdit[];
	}>());
	/**
	 * Fired to notify webviews that the document has changed.
	 */
	public readonly onDidChangeContent = this._onDidChangeDocument.event;

	private readonly _onDidChange = this._register(new vscode.EventEmitter<{
		readonly label: string,
		undo(): void,
		redo(): void,
	}>());
	/**
	 * Fired to tell VS Code that an edit has occurred in the document.
	 *
	 * This updates the document"s dirty indicator.
	 */
	public readonly onDidChange = this._onDidChange.event;

	/**
	 * Called by VS Code when there are no more references to the document.
	 *
	 * This happens when all editors for it have been closed.
	 */
	dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}

	/**
	 * Called when the user edits the document in a webview.
	 *
	 * This fires an event to notify VS Code that the document has been edited.
	 */
	makeEdit(edit: AudioToolkitEdit) {
		this._edits.push(edit);
		this._modulesState = edit.state;

		this._onDidChange.fire({
			label: "modules_state",
			undo: async () => {
				this._edits.pop();
				this._modulesState = this._edits[this._edits.length - 1]?.state || null;
				this._onDidChangeDocument.fire({
					content: this._modulesState,
					edits: this._edits,
				});
			},
			redo: async () => {
				this._edits.push(edit);
				this._modulesState = edit.state;
				this._onDidChangeDocument.fire({
					content: this._modulesState,
					edits: this._edits,
				});
			}
		});
	}

	/**
	 * Called by VS Code when the user saves the document.
	 */
	async save(cancellation: vscode.CancellationToken): Promise<void> {
		if (!this._jsonUri) {
			const fileInfo = await vscode.window.showSaveDialog();
			if (fileInfo) {
				this._jsonUri = fileInfo;
			} else {
				return;
			}
		}
		await this.saveAs(this._jsonUri, cancellation);
		this._savedEdits = Array.from(this._edits);
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		const fileData = Buffer.from(JSON.stringify(this._modulesState), "utf-8");
		if (cancellation.isCancellationRequested) {
			return;
		}
		await vscode.workspace.fs.writeFile(targetResource, new Uint8Array(fileData));
	}

	/**
	 * Called by VS Code when the user calls `revert` on a document.
	 */
	async revert(_cancellation: vscode.CancellationToken): Promise<void> {
		let modulesState: AudioToolkitModulesState | null = null;
		if (this._jsonUri) {
			try {
				const buffer = await vscode.workspace.fs.readFile(this._jsonUri);
				const str = Buffer.from(buffer).toString("utf-8");
				modulesState = JSON.parse(str);
			} catch (error) {
				console.log(error);
			}
		}
		this._modulesState = modulesState;
		this._edits = this._savedEdits;
		this._onDidChangeDocument.fire({
			content: modulesState,
			edits: this._edits,
		});
	}

	/**
	 * Called by VS Code to backup the edited document.
	 *
	 * These backups are used to implement hot exit.
	 */
	async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		await this.saveAs(destination, cancellation);

		return {
			id: destination.toString(),
			delete: async () => {
				try {
					await vscode.workspace.fs.delete(destination);
				} catch {
					// noop
				}
			}
		};
	}
}



class AudioEditorHost extends VSCodeHostProxy<AudioDocument, IVSCodeAudioEditorHost, IVSCodeAudioEditorWebview> {
	static fnNames: (keyof IVSCodeAudioEditorWebview)[] = ["init", "pauseOrResume", "playOrStop", "updateConfigurationFromHost", "updateModulesStateFromHost"];
	constructor(
		private provider: MainEditorProvider,
		private statusBarItem: vscode.StatusBarItem | null,
        public webviewPanel: vscode.WebviewPanel,
        public document: AudioDocument,
        disposables: vscode.Disposable[]
	) {
		super(webviewPanel, document, disposables);
	}
	ready() {
		const { document, webviewPanel, statusBarItem, provider } = this;
		const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);

		const isInWorkspace = document.uri.fsPath !== vscode.workspace.asRelativePath(document.uri);

		const configuration = vscode.workspace.getConfiguration("audioToolkit") as unknown as AudioEditorConfiguration;
		const initMessage = {
			data: isInWorkspace ? undefined : document.audioData,
			uri: webviewPanel.webview.asWebviewUri(document.uri).toString(),
			editable,
		};
		const modulesState = document.modulesState;
		this.init(initMessage, configuration, modulesState).then((sr) => {
			provider.sampleRateMap.set(document.uri, sr);
			if (statusBarItem) {
				statusBarItem.show();
				statusBarItem.text = `${sr}Hz`;
			}
		});
		// this.updateConfigurationFromHost(configuration);
	}
	makeEditModulesState(edit: AudioToolkitEdit) {
		this.document.makeEdit(edit);
	}
}

class MainEditorProvider implements vscode.CustomEditorProvider<AudioDocument>  {
	public static setStatusBarItem(item: vscode.StatusBarItem) {
		this.statusBarItem = item;
	}
	public static getActiveWebviewPanel(provider: MainEditorProvider) {
		for (const uri of provider.documentUris) {
			for (const webviewPanel of provider.webviews.get(uri)) {
				if (webviewPanel.active) {
					return webviewPanel;
				}
			}
		}
	}
	public static register(context: vscode.ExtensionContext) {
		const provider = new MainEditorProvider(context);
		const providerRegistration = vscode.window.registerCustomEditorProvider(MainEditorProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } });
		const playOrStopCommandRegistration = vscode.commands.registerCommand("audioToolkit.playOrStop", () => {
			const panel = this.getActiveWebviewPanel(provider);
			if (panel) {
				provider.proxies.get(panel)?.playOrStop();
			}
		});
		const pauseOrResumeCommandRegistration = vscode.commands.registerCommand("audioToolkit.pauseOrResume", () => {
			const panel = this.getActiveWebviewPanel(provider);
			if (panel) {
				provider.proxies.get(panel)?.pauseOrResume();
			}
		});
		return [providerRegistration, playOrStopCommandRegistration, pauseOrResumeCommandRegistration];
	}

	private static readonly viewType = "audioToolkit.editor";

	public static statusBarItem: vscode.StatusBarItem | null = null;

	/**
	 * Tracks all known webviews
	 */
	private readonly webviews = new WebviewCollection();
	private readonly documentUris = new Set<vscode.Uri>();
	public readonly sampleRateMap = new Map<vscode.Uri, number>();
	private readonly proxies = new Map<vscode.WebviewPanel, AudioEditorHost>();

	constructor(
		private readonly context: vscode.ExtensionContext
	) {
    }
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<AudioDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;
	
    saveCustomDocument(document: AudioDocument, cancellation: vscode.CancellationToken) {
        return document.save(cancellation);
    }
    saveCustomDocumentAs(document: AudioDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken) {
        return document.saveAs(destination, cancellation);
    }
    revertCustomDocument(document: AudioDocument, cancellation: vscode.CancellationToken) {
        return document.revert(cancellation);
    }
    backupCustomDocument(document: AudioDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken) {
        return document.backup(context.destination, cancellation);
    }
    async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken) {
		const document: AudioDocument = await AudioDocument.create(uri, openContext.backupId);

		const listeners: vscode.Disposable[] = [];

		listeners.push(document.onDidChange(e => {
			// Tell VS Code that the document has been edited by the use.
			this._onDidChangeCustomDocument.fire({
				document,
				...e,
			});
		}));

		listeners.push(document.onDidChangeContent(e => {
			// Update all webviews when the document changes
			for (const webviewPanel of this.webviews.get(document.uri)) {
				this.proxies.get(webviewPanel)?.updateModulesStateFromHost(e.content);
			}
		}));
		
		listeners.push(vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("audioToolkit")) {
				const webviewsForDocument = Array.from(this.webviews.get(document.uri));
				webviewsForDocument.forEach((panel) => {
					this.proxies.get(panel)?.updateConfigurationFromHost(vscode.workspace.getConfiguration("audioToolkit") as unknown as AudioEditorConfiguration);
				});
			}
		}));

		document.onDidDispose(() => disposeAll(listeners));

		return document;
    }

    public async resolveCustomEditor(document: AudioDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);
		const disposables: vscode.Disposable[] = [];
		const proxy = new AudioEditorHost(this, MainEditorProvider.statusBarItem, webviewPanel, document, disposables);
		this.proxies.set(webviewPanel, proxy);
		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.onDidDispose(() => {
			disposeAll(disposables);
			this.proxies.delete(webviewPanel);
			MainEditorProvider.statusBarItem?.hide();
		});
		webviewPanel.onDidChangeViewState((e) => {
			if (e.webviewPanel.active) {
				const sr = this.sampleRateMap.get(document.uri);
				if (MainEditorProvider.statusBarItem) {
					MainEditorProvider.statusBarItem.show();
					MainEditorProvider.statusBarItem.text = `${sr}Hz`;
				}
			} else {
				MainEditorProvider.statusBarItem?.hide();
			}
		});
		this.documentUris.add(document.uri);
    }

    /**
     * Defines and returns the HTML that should be rendered within the webview panel.
     *
     * @remarks This is also the place where references to the React webview build files
     * are created and inserted into the webview HTML.
     *
     * @param webview A reference to the extension webview
     * @returns A template string literal containing the HTML that should be
     * rendered within the webview panel
     */
	private getHtmlForWebview(webview: vscode.Webview): string {
        const { extensionUri } = this.context;
        // The CSS file from the React build output
        const stylesUri = getUri(webview, extensionUri, ["dist", "web", "webview", "assets", "style.css"]);
        // The JS file from the React build output
        const scriptUri = getUri(webview, extensionUri, ["dist", "web", "webview", "index.js"]);

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

        const documentTitle = "Audio Toolkit Editor";

		return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <!--
    Use a content security policy to only allow loading images from https or from our extension directory,
    and only allow scripts that have a specific nonce.
    -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource}; font-src ${webview.cspSource} data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-eval' 'nonce-${nonce}' ${webview.cspSource} 'self'; worker-src 'self' blob:;">

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <link rel="stylesheet" type="text/css" href="${stylesUri}">

    <title>${documentTitle}</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
	}

}

export default MainEditorProvider;
