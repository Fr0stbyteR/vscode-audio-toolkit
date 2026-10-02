import "@vscode/codicons/dist/codicon.css";
import { FunctionComponent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AudioEditor from "../core/AudioEditor";
import { restoreMetadata } from "../core/MusicMetadata";
import AudioEditorContainer from "../components/AudioEditorContainer";
import { AudioEditorContext } from "../components/contexts";
import { AudioToolkitModulesState } from "../core/AudioToolkitModule";
import MusicAnalysisClient, { BackendSettings } from "./MusicAnalysisClient";
import FileExplorer, { FileExplorerHandle } from "./FileExplorer";
import { LocalAudioEntry } from "./types";
import getLibrosaModules from "../modules/librosa";
import getEssentiaModules from "../modules/essentia";
import LibrosaAnalysisModule from "../modules/librosa/LibrosaAnalysisModule";
import getMarkerModules from "../modules/marker";
import getSpectrogramModules from "../modules/spectrogram";
import getWaveformModules from "../modules/waveform";
import getSemanticDescriptionModules from "../modules/semantic-description";
import ClapRelevanceCurve from "../modules/semantic-description/ClapRelevanceCurve";
import SemanticDescription from "../modules/semantic-description/SemanticDescription";
import getScoreModules from "../modules/score";
import getMusicFeatureModules from "../modules/music-features";
import { contentHashAudio, fingerprintAudio } from "./AudioFingerprint";
import WorkspaceAnalysisStore, { WorkspaceDocument } from "./WorkspaceAnalysisStore";
import BrowserAnalysisStore from "./BrowserAnalysisStore";
import { CachedAnalysis, mergeCachedAnalyses } from "../core/AnalysisCache";
import { useLocale } from "../i18n/LocaleContext";
import "../theme.css";
import "./standalone.css";

const MODULES_KEY = "audioToolkit.web.modules";
const MUSIC_SETTINGS_KEY = "audioToolkit.web.musicBackend";
const MUSIC_TOKEN_KEY = "audioToolkit.web.musicToken";

async function registerModules() {
    if (Object.keys(AudioEditor.MODULES_MAP).length) return;
    const groups = await Promise.all([getWaveformModules(), getSpectrogramModules(), getMarkerModules(), getLibrosaModules(), getEssentiaModules(), getSemanticDescriptionModules(), getScoreModules(), getMusicFeatureModules()]);
    groups.flat().forEach(Module => AudioEditor.MODULES_MAP[Module.MODULE_ID] = Module);
}

const defaultMusicSettings: BackendSettings = {
    baseUrl: import.meta.env.VITE_MUSIC_ANALYSIS_API || "http://127.0.0.1:49321/",
    token: import.meta.env.VITE_MUSIC_ANALYSIS_TOKEN || ""
};

function browserDocumentKey(audioHash: string) { return `${MODULES_KEY}:${audioHash}`; }

function readBrowserDocument(audioHash: string): WorkspaceDocument | undefined {
    try {
        const value = JSON.parse(localStorage.getItem(browserDocumentKey(audioHash)) || "null") as WorkspaceDocument | null;
        return value?.audioHash === audioHash && Array.isArray(value.modulesState) ? value : undefined;
    } catch { return undefined; }
}

function legacyLayout(): AudioToolkitModulesState | undefined {
    try {
        const modules = JSON.parse(localStorage.getItem(MODULES_KEY) || "null") as AudioToolkitModulesState | null;
        if (!Array.isArray(modules)) return undefined;
        // The old key was shared by every audio file. Keep its layout, never its annotations.
        return modules.map(module => ({
            ...module,
            state: module.moduleId === "marker" ? { ...module.state, data: [] }
                : module.moduleId.startsWith("librosa.") ? { ...module.state, data: undefined }
                    : module.moduleId.startsWith("score.") ? { ...module.state, scoreKey: "", fileName: "", format: "", alignmentAudioKey: "", autoAlignment: [], manualAnchors: [], hiddenTracks: [] }
                        : module.state
        }));
    } catch { return undefined; }
}

const StandaloneApp: FunctionComponent = () => {
    const { locale, setLocale, t } = useLocale();
    const [musicSettings, setMusicSettings] = useState<BackendSettings>(() => {
        try { return { ...defaultMusicSettings, ...JSON.parse(localStorage.getItem(MUSIC_SETTINGS_KEY) || "{}"), token: localStorage.getItem(MUSIC_TOKEN_KEY) ?? sessionStorage.getItem(MUSIC_TOKEN_KEY) ?? defaultMusicSettings.token }; }
        catch { return defaultMusicSettings; }
    });
    const [draftMusicSettings, setDraftMusicSettings] = useState(musicSettings);
    const musicClient = useMemo(() => new MusicAnalysisClient(musicSettings), [musicSettings]);
    const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
    const [musicBackendStatus, setMusicBackendStatus] = useState<"checking" | "online" | "idle" | "offline">("checking");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [editor, setEditor] = useState<AudioEditor | null>(null);
    const editorRef = useRef<AudioEditor | null>(null);
    const workspaceRef = useRef<WorkspaceAnalysisStore | null>(null);
    const browserAnalysisRef = useRef<BrowserAnalysisStore | null>(null);
    const openRevision = useRef(0);
    const [folderSaving, setFolderSaving] = useState<"unavailable" | "permission" | "syncing" | "enabled" | "error">("unavailable");
    const [folderError, setFolderError] = useState("");
    const [entry, setEntry] = useState<LocalAudioEntry>();
    const [openingAudio, setOpeningAudio] = useState(false);
    const [error, setError] = useState("");
    const audioFileInput = useRef<HTMLInputElement>(null);
    const fileExplorerRef = useRef<FileExplorerHandle>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const resetDialogRef = useRef<HTMLDialogElement>(null);
    const currentFileRef = useRef<File>();
    const currentHashRef = useRef("");
    const [editorSession, setEditorSession] = useState(0);
    useEffect(() => { if (shellRef.current) shellRef.current.inert = openingAudio; }, [openingAudio]);

    useEffect(() => {
        if (musicSettings.token) localStorage.setItem(MUSIC_TOKEN_KEY, musicSettings.token);
    }, [musicSettings.token]);

    useEffect(() => {
        let active = true;
        setBackendStatus("checking");
        setMusicBackendStatus("checking");
        musicClient.health().then(capabilities => {
            if (!active) return;
            setBackendStatus("online");
            const loaded = capabilities.providers.some(provider => provider.loaded && provider.supportsTextEmbeddings);
            setMusicBackendStatus(loaded ? "online" : "idle");
        }).catch(() => {
            if (active) { setBackendStatus("offline"); setMusicBackendStatus("offline"); }
        });
        return () => { active = false; };
    }, [musicClient]);

    useEffect(() => () => {
        void workspaceRef.current?.flushDocument();
        void editorRef.current?.context.close();
    }, []);

    useEffect(() => {
        if (!editor) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (openingAudio || resetDialogRef.current?.open) return;
            const target = event.composedPath()[0] as HTMLElement | undefined;
            if (target?.matches?.("input, textarea, select, button, vscode-button, vscode-text-field, vscode-dropdown, [contenteditable=true]")) return;
            const key = event.key.toLowerCase();
            if (event.code === "Space") {
                event.preventDefault();
                if (editor.state.playing === "playing") editor.stop();
                else {
                    if (editor.context.state === "suspended") void editor.context.resume();
                    if (editor.state.playing === "paused") editor.resume();
                    else editor.play();
                }
            } else if (key === "k" && editor.state.playing !== "stopped") {
                event.preventDefault();
                if (editor.state.playing === "playing") editor.pause();
                else editor.resume();
            } else if (event.key === "Escape") {
                editor.setSelRange(null);
            } else if (event.key === "Home") {
                event.preventDefault();
                editor.setViewRangeToAll();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [editor, openingAudio]);

    const openEntry = useCallback(async (nextEntry: LocalAudioEntry, reset = false) => {
        const revision = ++openRevision.current;
        setError("");
        setFolderError("");
        setOpeningAudio(true);
        let nextContext: AudioContext | undefined;
        try {
            await workspaceRef.current?.flushDocument();
            const file = await nextEntry.getFile();
            const data = await file.arrayBuffer();
            const [assetKey, audioHash] = await Promise.all([fingerprintAudio(data), contentHashAudio(data)]);
            await registerModules();
            const previous = editorRef.current;
            nextContext = new AudioContext({ latencyHint: "interactive" });
            const workspace = nextEntry.rootHandle ? new WorkspaceAnalysisStore(nextEntry.rootHandle, audioHash, nextEntry.path) : null;
            const browserAnalysis = new BrowserAnalysisStore(audioHash);
            const safelyList = async (list: () => Promise<CachedAnalysis[]>) => {
                try { return await list(); }
                catch (reason) { console.warn("Could not list local analysis cache", reason); return []; }
            };
            let cachedAnalyses = mergeCachedAnalyses(...await Promise.all([
                safelyList(() => browserAnalysis.list()), safelyList(() => workspace?.listAnalyses() ?? Promise.resolve([]))
            ]));
            let constructedEditor: AudioEditor | undefined;
            const rememberAnalysis = (request: Parameters<AudioEditor["analyze"]>[0]) => {
                cachedAnalyses = mergeCachedAnalyses(cachedAnalyses, [{ request, savedAt: new Date().toISOString() }]);
                if (constructedEditor && editorRef.current === constructedEditor) constructedEditor.setCachedAnalyses(cachedAnalyses);
            };
            let folderDocument: WorkspaceDocument | undefined;
            if (workspace) {
                try { folderDocument = await workspace.loadDocument(); }
                catch (reason) { console.warn("Could not restore workspace document from folder", reason); }
            }
            const browserDocument = readBrowserDocument(audioHash);
            const restoredDocument = folderDocument && (!browserDocument || folderDocument.savedAt >= browserDocument.savedAt) ? folderDocument : browserDocument;
            const modulesState: AudioToolkitModulesState | undefined = reset ? undefined : restoredDocument?.modulesState ?? legacyLayout();
            const canWrite = workspace ? await workspace.inspectWritePermission() : false;
            const reportSaveError = (reason: unknown) => {
                if (workspaceRef.current !== workspace) return;
                setFolderSaving("error");
                setFolderError(reason instanceof Error ? reason.message : String(reason));
            };
            const nextEditor = await AudioEditor.fromData(
                data,
                nextContext,
                {},
                modulesState,
                assetKey,
                undefined,
                async request => {
                    if (workspace) {
                        try {
                            const saved = await workspace.loadLibrosa(request);
                            if (saved) return saved;
                        } catch (reason) { console.warn("Could not restore librosa analysis from folder", reason); }
                    }
                    try {
                        const saved = await browserAnalysis.load(request);
                        if (saved) {
                            if (workspace?.canWrite) {
                                try { await workspace.saveLibrosa(request, saved); }
                                catch (reason) { reportSaveError(reason); }
                            }
                            return saved;
                        }
                    } catch (reason) { console.warn("Could not restore browser analysis", reason); }
                    const result = await musicClient.analyze(file, request);
                    let savedLocally = false;
                    if (workspace?.canWrite) {
                        try { await workspace.saveLibrosa(request, result); savedLocally = true; }
                        catch (reason) { reportSaveError(reason); }
                    }
                    if (!savedLocally) {
                        try { await browserAnalysis.save(request, result); savedLocally = true; }
                        catch (reason) { console.warn("Could not cache browser analysis", reason); }
                    }
                    if (savedLocally) rememberAnalysis(request);
                    return result;
                },
                async request => {
                    if (workspace) {
                        try {
                            const saved = await workspace.loadDescription(request);
                            if (saved) return saved;
                        } catch (reason) { console.warn("Could not restore description from folder", reason); }
                    }
                    const result = await musicClient.describe(file, request);
                    if (workspace?.canWrite) {
                        try { await workspace.saveDescription(request, result); }
                        catch (reason) { reportSaveError(reason); }
                    }
                    return result;
                },
                async (request, onProgress, signal) => {
                    if (workspace) {
                        try {
                            const saved = request.cachePolicy === "refresh" ? undefined : await workspace.loadCurve(request);
                            if (saved) { onProgress?.(saved, saved.points.length); return saved; }
                        } catch (reason) { console.warn("Could not restore curve from folder", reason); }
                    }
                    const result = await musicClient.relevanceCurve(file, request, onProgress, signal);
                    if (workspace?.canWrite) {
                        try { await workspace.saveCurve(request, result); }
                        catch (reason) { reportSaveError(reason); }
                    }
                    return result;
                },
                request => musicClient.mood(file, request),
                (scoreFile, onProgress, signal) => musicClient.recognizeScore(scoreFile, onProgress, signal)
            );
            constructedEditor = nextEditor;
            nextEditor.setCachedAnalyses(cachedAnalyses);
            if (revision !== openRevision.current) {
                nextEditor.modulesInstance.forEach(module => module.dispose?.());
                void nextEditor.context.close();
                return;
            }
            nextEditor.metadata = restoreMetadata(reset ? undefined : restoredDocument?.metadata);
            const saveDocument = () => {
                if (editorRef.current !== nextEditor) return;
                const state = nextEditor.modulesState;
                const snapshot: WorkspaceDocument = { format: "audio-toolkit-workspace", version: 1, audioHash, relativePath: nextEntry.path, savedAt: new Date().toISOString(), modulesState: state, metadata: nextEditor.metadata };
                try { localStorage.setItem(browserDocumentKey(audioHash), JSON.stringify(snapshot)); }
                catch (reason) { console.warn("Could not save browser module state", reason); }
                workspace?.scheduleDocument(state, reportSaveError, nextEditor.metadata);
            };
            nextEditor.on("modulesState", saveDocument);
            nextEditor.on("metadata", saveDocument);
            workspaceRef.current = workspace;
            browserAnalysisRef.current = browserAnalysis;
            setFolderSaving(workspace ? canWrite ? "enabled" : "permission" : "unavailable");
            const initialSnapshot: WorkspaceDocument = {
                format: "audio-toolkit-workspace", version: 1, audioHash, relativePath: nextEntry.path,
                savedAt: new Date().toISOString(), modulesState: nextEditor.modulesState, metadata: nextEditor.metadata
            };
            try { localStorage.setItem(browserDocumentKey(audioHash), JSON.stringify(initialSnapshot)); }
            catch (reason) { console.warn("Could not save initial browser module state", reason); }
            if (canWrite) workspace?.scheduleDocument(nextEditor.modulesState, reportSaveError, nextEditor.metadata);
            editorRef.current = nextEditor;
            currentFileRef.current = file;
            currentHashRef.current = audioHash;
            setEditorSession(value => value + 1);
            setEntry(nextEntry);
            setEditor(nextEditor);
            setOpeningAudio(false);
            if (previous) { previous.modulesInstance.forEach(module => module.dispose?.()); void previous.context.close(); }
        } catch (reason) {
            if (nextContext) void nextContext.close();
            if (revision !== openRevision.current) return;
            setOpeningAudio(false);
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    }, [musicClient]);

    const resetAudio = async () => {
        if (!entry || !editorRef.current || openingAudio) return;
        resetDialogRef.current?.close();
        setOpeningAudio(true);
        setError("");
        const current = editorRef.current;
        try {
            await workspaceRef.current?.resetLocal();
            await browserAnalysisRef.current?.resetLocal();
            localStorage.removeItem(browserDocumentKey(currentHashRef.current));
            if (currentFileRef.current) musicClient.clearAudio(currentFileRef.current);
            // Stop old modules before reopening so late callbacks cannot restore
            // annotations or write their completed jobs back into the new store.
            editorRef.current = null;
            setEditor(null);
            current.stop();
            current.modulesInstance.forEach(module => module.dispose?.());
            void current.context.close();
            await openEntry(entry, true);
        } catch (reason) {
            setOpeningAudio(false);
            setError(`${t("Could not reset audio")}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
    };

    const enableFolderSaving = async () => {
        const workspace = workspaceRef.current;
        if (!workspace || !editorRef.current) return;
        setFolderError("");
        try {
            await workspace.enableWriting();
            workspace.scheduleDocument(editorRef.current.modulesState, reason => {
                setFolderSaving("error");
                setFolderError(reason instanceof Error ? reason.message : String(reason));
            }, editorRef.current.metadata);
            await workspace.flushDocument();
            setFolderSaving("syncing");
            const failures: string[] = [];
            // Analyses run before write permission need one cache-backed pass to enter the folder.
            for (const module of editorRef.current.modulesInstance) {
                if (workspaceRef.current !== workspace) break;
                if (module instanceof LibrosaAnalysisModule || module instanceof ClapRelevanceCurve) {
                    await module.calculate();
                    if (Array.isArray(module.isCalculating) && module.isCalculating[0] < 0) failures.push(module.moduleId);
                } else if (module instanceof SemanticDescription && module.lastRequest && module.lastResult) {
                    await workspace.saveDescription(module.lastRequest, module.lastResult);
                }
            }
            await workspace.flushDocument();
            if (failures.length) throw new Error(`Some existing analyses could not be copied: ${failures.join(", ")}`);
            setFolderSaving("enabled");
        } catch (reason) {
            setFolderSaving("error");
            setFolderError(reason instanceof Error ? reason.message : String(reason));
        }
    };



    const saveSettings = () => {
        const normalizedMusic = { ...draftMusicSettings, baseUrl: draftMusicSettings.baseUrl.trim() || defaultMusicSettings.baseUrl };
        localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify({ baseUrl: normalizedMusic.baseUrl }));
        localStorage.setItem(MUSIC_TOKEN_KEY, normalizedMusic.token);
        sessionStorage.removeItem(MUSIC_TOKEN_KEY);
        setMusicSettings(normalizedMusic);
        setSettingsOpen(false);
    };

    return <><div className="standalone-shell" ref={shellRef} aria-busy={openingAudio}>
        <header className="app-header">
            <div className="brand"><span className="brand-mark">AT</span><div><strong>Audio Toolkit</strong><small>{t("Browser workspace")}</small></div></div>
            <div className="current-file">{entry ? <><span>{t("NOW INSPECTING")}</span><strong>{entry.name}</strong><small>{entry.path}</small></> : <span>{t("Choose an audio file from the library")}</span>}</div>
            <div className="app-header-actions">
                {entry?.rootHandle ? <button className={`folder-save-button ${folderSaving}`} type="button" disabled={folderSaving === "syncing"} onClick={() => void enableFolderSaving()} title={folderError || t(folderSaving === "enabled" ? "Folder auto-save is on" : "Enable saving in .audio_toolkit")}>
                    <span className={`codicon codicon-${folderSaving === "enabled" ? "check" : "save"}`} />
                    {t(folderSaving === "enabled" ? "Folder saving on" : folderSaving === "syncing" ? "Saving existing analyses…" : folderSaving === "error" ? "Retry folder save" : "Save analyses in folder")}
                </button> : null}
                <button className="backend-button" onClick={() => setSettingsOpen(value => !value)}>
                    <span className={`status-dot ${backendStatus}`} />
                    {t(backendStatus === "online" ? "Librosa ready" : backendStatus === "checking" ? "Checking service" : "Service offline")}
                    <span className={`status-dot ${musicBackendStatus}`} />
                    {t(musicBackendStatus === "online" ? "CLAP loaded" : musicBackendStatus === "idle" ? "Load CLAP" : musicBackendStatus === "checking" ? "Checking CLAP" : "CLAP offline")}
                    <span className="codicon codicon-settings-gear" />
                </button>
                <div className="locale-switch" role="group" aria-label="Language / 语言">
                    <button type="button" className={locale === "zh" ? "active" : ""} aria-pressed={locale === "zh"} onClick={() => setLocale("zh")}>中</button>
                    <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
                </div>
            </div>
        </header>
        {settingsOpen && <section className="backend-popover">
            <strong>{t("Music analysis service · librosa + CLAP")}</strong>
            <label>{t("API base URL")}<input value={draftMusicSettings.baseUrl} onChange={event => setDraftMusicSettings(value => ({ ...value, baseUrl: event.target.value }))} placeholder="http://127.0.0.1:49321/" /></label>
            <label>{t("Bearer token")} <span>{t("(saved in this browser)")}</span><input type="password" value={draftMusicSettings.token} onChange={event => setDraftMusicSettings(value => ({ ...value, token: event.target.value }))} /></label>
            <div><button className="secondary" onClick={() => setSettingsOpen(false)}>{t("Cancel")}</button><button onClick={saveSettings}>{t("Connect")}</button></div>
        </section>}
        <aside className="workspace-sidebar">
            <FileExplorer ref={fileExplorerRef} activeId={entry?.id} onOpen={openEntry} />
            <div id="standalone-layers-host" />
        </aside>
        <main className="web-editor">
            {folderError && <div className="banner error-text"><strong>{t("Folder save failed")}</strong><span>{folderError}</span></div>}
            {error && <div className="banner error-text"><strong>{t("Could not open audio")}</strong><span>{error}</span></div>}
            {editor && entry ? <AudioEditorContext.Provider value={editor}><AudioEditorContainer standalone key={editorSession} onResetAudio={() => resetDialogRef.current?.showModal()} /></AudioEditorContext.Provider> : <div className="welcome">
                <input ref={audioFileInput} className="hidden-input" type="file" accept="audio/*,.aif,.aiff" onChange={event => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void openEntry({ id: `single:${file.name}:${file.size}:${file.lastModified}`, name: file.name, path: file.name, getFile: async () => file });
                    event.currentTarget.value = "";
                }} />
                <button type="button" onClick={() => fileExplorerRef.current?.openFolder()}>{t("Open folder")}</button>
                <button type="button" className="secondary" onClick={() => audioFileInput.current?.click()}>{t("Open one audio file")}</button>
            </div>}
        </main>
    </div>
    {openingAudio ? createPortal(<div className="loading-overlay" role="status" aria-live="polite"><span className="spinner" /><strong>{t("Reading local audio")}</strong></div>, document.body) : null}
    {createPortal(<dialog className="audio-reset-dialog" ref={resetDialogRef} aria-labelledby="audio-reset-title">
        <h3 id="audio-reset-title">{t("Reset this audio?")}</h3>
        <strong>{entry?.name}</strong>
        <p>{t("This clears all modules, markers, score links, metadata and local analysis results for this audio. This cannot be undone.")}</p>
        <p>{t("The original audio, other audio files, backend caches and connection settings are kept.")}</p>
        <div className="audio-reset-actions"><button type="button" className="secondary" autoFocus onClick={() => resetDialogRef.current?.close()}>{t("Cancel")}</button><button type="button" onClick={() => void resetAudio()}>{t("Clear and reset")}</button></div>
    </dialog>, document.body)}</>;
};

export default StandaloneApp;
