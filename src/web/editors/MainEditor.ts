import * as vscode from "vscode";
import { getNonce, getUri, Disposable, WebviewCollection, disposeAll } from "../utils";

/**
 * Define the type of edits used in paw draw files.
 */
interface AudioEdit {
	readonly color: string;
	readonly stroke: ReadonlyArray<[number, number]>;
}

interface AudioDocumentDelegate {
	getFileData(): Promise<Uint8Array>;
}

class AudioDocument extends Disposable implements vscode.CustomDocument {
	static async create(uri: vscode.Uri, backupId: string | undefined, delegate: AudioDocumentDelegate) {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
		const fileData = await AudioDocument.readFile(dataFile);
		return new AudioDocument(uri, fileData, delegate);
	}

	private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		if (uri.scheme === "untitled") {
			return new Uint8Array();
		}
		return new Uint8Array(await vscode.workspace.fs.readFile(uri));
	}

	private readonly _uri: vscode.Uri;

	private _documentData: Uint8Array;
	private _edits: Array<AudioEdit> = [];
	private _savedEdits: Array<AudioEdit> = [];

	private readonly _delegate: AudioDocumentDelegate;

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array,
		delegate: AudioDocumentDelegate
	) {
		super();
		this._uri = uri;
		this._documentData = initialContent;
		this._delegate = delegate;
	}

	public get uri() { return this._uri; }

	public get documentData(): Uint8Array { return this._documentData; }

	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	/**
	 * Fired when the document is disposed of.
	 */
	public readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
		readonly content?: Uint8Array;
		readonly edits: readonly AudioEdit[];
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
	makeEdit(edit: AudioEdit) {
		this._edits.push(edit);

		this._onDidChange.fire({
			label: "Stroke",
			undo: async () => {
				this._edits.pop();
				this._onDidChangeDocument.fire({
					edits: this._edits,
				});
			},
			redo: async () => {
				this._edits.push(edit);
				this._onDidChangeDocument.fire({
					edits: this._edits,
				});
			}
		});
	}

	/**
	 * Called by VS Code when the user saves the document.
	 */
	async save(cancellation: vscode.CancellationToken): Promise<void> {
		await this.saveAs(this.uri, cancellation);
		this._savedEdits = Array.from(this._edits);
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		const fileData = await this._delegate.getFileData();
		if (cancellation.isCancellationRequested) {
			return;
		}
		await vscode.workspace.fs.writeFile(targetResource, fileData);
	}

	/**
	 * Called by VS Code when the user calls `revert` on a document.
	 */
	async revert(_cancellation: vscode.CancellationToken): Promise<void> {
		const diskContent = await AudioDocument.readFile(this.uri);
		this._documentData = diskContent;
		this._edits = this._savedEdits;
		this._onDidChangeDocument.fire({
			content: diskContent,
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

class MainEditorProvider implements vscode.CustomEditorProvider<AudioDocument>  {
	public static setStatusBarItem(item: vscode.StatusBarItem) {
		this.statusBarItem = item;
	}
	public static register(context: vscode.ExtensionContext) {
		const provider = new MainEditorProvider(context);
		const providerRegistration = vscode.window.registerCustomEditorProvider(MainEditorProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } });
		const postMessageToActiveWebviewPanel = async (type: string, body?: any) => {
			for (const uri of provider.documentUris) {
				let found = false;
				for (const webviewPanel of provider.webviews.get(uri)) {
					if (webviewPanel.active) {
						provider.postMessage(webviewPanel, type, body || null);
						found = true;
						break;
					}
				}
				if (found) {
					break;
				}
			}
		};
		const playOrStopCommandRegistration = vscode.commands.registerCommand("audioToolkit.playOrStop", () => postMessageToActiveWebviewPanel("playOrStop"));
		const pauseOrResumeCommandRegistration = vscode.commands.registerCommand("audioToolkit.pauseOrResume", () => postMessageToActiveWebviewPanel("pauseOrResume"));
		return [providerRegistration, playOrStopCommandRegistration, pauseOrResumeCommandRegistration];
	}

	private static readonly viewType = "audioToolkit.editor";

	private static statusBarItem: vscode.StatusBarItem | null = null;

	/**
	 * Tracks all known webviews
	 */
	private readonly webviews = new WebviewCollection();
	private readonly documentUris = new Set<vscode.Uri>();
	private readonly sampleRateMap = new Map<vscode.Uri, number>();

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
		const document: AudioDocument = await AudioDocument.create(uri, openContext.backupId, {
			getFileData: async () => {
				const webviewsForDocument = Array.from(this.webviews.get(document.uri));
				if (!webviewsForDocument.length) {
					throw new Error("Could not find webview to save for");
				}
				const panel = webviewsForDocument[0];
				const response = await this.postMessageWithResponse<number[]>(panel, "getFileData", {});
				return new Uint8Array(response);
			}
		});

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
				this.postMessage(webviewPanel, "update", {
					edits: e.edits,
					content: e.content,
				});
			}
		}));
		
		listeners.push(vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("audioToolkit")) {
				const webviewsForDocument = Array.from(this.webviews.get(document.uri));
				webviewsForDocument.forEach((panel) => {
					this.postMessage(panel, "updateConfigurationFromHost", vscode.workspace.getConfiguration("audioToolkit"));
				});
			}
		}));

		document.onDidDispose(() => disposeAll(listeners));

		return document;
    }

	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();

	private postMessageWithResponse<R = unknown>(panel: vscode.WebviewPanel, type: string, body: any): Promise<R> {
		const requestId = this._requestId++;
		const p = new Promise<R>(resolve => this._callbacks.set(requestId, resolve));
		panel.webview.postMessage({ type, requestId, body });
		return p;
	}

	private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}

	private onMessage(webviewPanel: vscode.WebviewPanel, document: AudioDocument, message: any) {
		switch (message.type) {
			case "ready":
                {
                    const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);
    
                    const initMessage = {
                        value: document.documentData,
						configuration: vscode.workspace.getConfiguration("audioToolkit"),
                        editable,
                    };
                    this.postMessageWithResponse<number>(webviewPanel, "init", initMessage).then((sr) => {
						this.sampleRateMap.set(document.uri, sr);
						if (MainEditorProvider.statusBarItem) {
							MainEditorProvider.statusBarItem.show();
							MainEditorProvider.statusBarItem.text = `${sr}Hz`;
						}
					});
					this.postMessage(webviewPanel, "updateConfigurationFromHost", vscode.workspace.getConfiguration("audioToolkit"));
                    return;    
                }
			case "stroke":
				document.makeEdit(message as AudioEdit);
				return;
			case "response":
                {
                    const callback = this._callbacks.get(message.requestId);
                    callback?.(message.body);
                    return;
                }
            case "hello":
                // Code that should run in response to the hello message command
                vscode.window.showInformationMessage(message.text);
                return;
		}
	}

    public async resolveCustomEditor(document: AudioDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);
		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(webviewPanel, document, e));

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e => {
			if (e.type === "ready") {
                /*
				if (document.uri.scheme === "untitled") {
					this.postMessage(webviewPanel, "init", {
						untitled: true,
						editable: true,
					});
				} else {
					const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);

					this.postMessage(webviewPanel, "init", {
						value: document.documentData,
						editable,
					});
				}
                    */
			}
		});

		webviewPanel.onDidDispose(() => MainEditorProvider.statusBarItem?.hide());
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
        const stylesUri = getUri(webview, extensionUri, ["dist", "web", "webview", "assets", "index.css"]);
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource}; font-src ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-eval' 'nonce-${nonce}' ${webview.cspSource} 'self'; worker-src 'self' blob:;">

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
