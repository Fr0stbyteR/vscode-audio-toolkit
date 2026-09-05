import { spawn } from "child_process";
import * as vscode from "vscode";
import { AudioAnalysisService } from "../web/analysis/AudioAnalysisService";
import { AudioAnalysisRequest, AudioAnalysisResult } from "../web/proxies/VSCodeAudioEditor.types";

interface PythonCommand {
    executable: string;
    args: string[];
}

export default class LibrosaAnalysisService implements AudioAnalysisService {
    constructor(private readonly extensionUri: vscode.Uri) {}

    async analyze(uri: vscode.Uri, request: AudioAnalysisRequest): Promise<AudioAnalysisResult> {
        if (uri.scheme !== "file") {
            throw new Error(`Librosa analysis currently requires a local file, received ${uri.scheme}: URI.`);
        }
        const configured = vscode.workspace.getConfiguration("audioToolkit").get<string>("pythonPath", "").trim();
        const commands: PythonCommand[] = configured
            ? [{ executable: configured, args: [] }]
            : process.platform === "win32"
                ? [{ executable: "py", args: ["-3"] }, { executable: "python", args: [] }]
                : [{ executable: "python3", args: [] }, { executable: "python", args: [] }];
        let lastError: Error | undefined;
        for (const command of commands) {
            try {
                return await this.run(command, uri.fsPath, request);
            } catch (error) {
                lastError = error as Error;
                if (configured || !/ENOENT|not found|Librosa backend is unavailable/i.test(lastError.message)) {
                    break;
                }
            }
        }
        throw lastError ?? new Error("No Python 3 interpreter was found.");
    }

    private run(command: PythonCommand, audioPath: string, request: AudioAnalysisRequest): Promise<AudioAnalysisResult> {
        const scriptPath = vscode.Uri.joinPath(this.extensionUri, "python", "audio_toolkit_engine.py").fsPath;
        return new Promise((resolve, reject) => {
            const child = spawn(command.executable, [...command.args, scriptPath], {
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"]
            });
            const stdout: Buffer[] = [];
            const stderr: Buffer[] = [];
            child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
            child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
            child.once("error", reject);
            child.once("close", code => {
                const output = Buffer.concat(stdout).toString("utf8").trim();
                const errorOutput = Buffer.concat(stderr).toString("utf8").trim();
                if (code !== 0) {
                    reject(new Error(errorOutput || output || `Python analysis exited with code ${code}.`));
                    return;
                }
                try {
                    resolve(JSON.parse(output) as AudioAnalysisResult);
                } catch (error) {
                    reject(new Error(`Invalid response from librosa backend: ${(error as Error).message}`));
                }
            });
            child.stdin.end(JSON.stringify({ path: audioPath, ...request }));
        });
    }
}
