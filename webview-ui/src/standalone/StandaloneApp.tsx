import "@vscode/codicons/dist/codicon.css";
import { FunctionComponent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AudioEditor from "../core/AudioEditor";
import AudioEditorContainer from "../components/AudioEditorContainer";
import { AudioEditorContext } from "../components/contexts";
import { AudioToolkitModulesState } from "../core/AudioToolkitModule";
import MusicAnalysisClient, { BackendSettings } from "./MusicAnalysisClient";
import FileExplorer from "./FileExplorer";
import { LocalAudioEntry } from "./types";
import getLibrosaModules from "../modules/librosa";
import getMarkerModules from "../modules/marker";
import getSpectrogramModules from "../modules/spectrogram";
import getWaveformModules from "../modules/waveform";
import getSemanticDescriptionModules from "../modules/semantic-description";
import getScoreModules from "../modules/score";
import { fingerprintAudio } from "./AudioFingerprint";
import { useLocale } from "../i18n/LocaleContext";
import "../vscode.css";
import "./standalone.css";

const MODULES_KEY = "audioToolkit.web.modules";
const MUSIC_SETTINGS_KEY = "audioToolkit.web.musicBackend";
const MUSIC_TOKEN_KEY = "audioToolkit.web.musicToken";

async function registerModules() {
    if (Object.keys(AudioEditor.MODULES_MAP).length) return;
    const groups = await Promise.all([getWaveformModules(), getSpectrogramModules(), getMarkerModules(), getLibrosaModules(), getSemanticDescriptionModules(), getScoreModules()]);
    groups.flat().forEach(Module => AudioEditor.MODULES_MAP[Module.MODULE_ID] = Module);
}

const defaultMusicSettings: BackendSettings = {
    baseUrl: import.meta.env.VITE_MUSIC_ANALYSIS_API || "http://127.0.0.1:49321/",
    token: import.meta.env.VITE_MUSIC_ANALYSIS_TOKEN || ""
};

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
    const [entry, setEntry] = useState<LocalAudioEntry>();
    const [openingAudio, setOpeningAudio] = useState(false);
    const [error, setError] = useState("");
    const audioFileInput = useRef<HTMLInputElement>(null);

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

    useEffect(() => () => { void editorRef.current?.context.close(); }, []);

    useEffect(() => {
        if (!editor) return;
        const handleKeyDown = (event: KeyboardEvent) => {
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
    }, [editor]);

    const openEntry = useCallback(async (nextEntry: LocalAudioEntry) => {
        setError("");
        setOpeningAudio(true);
        let nextContext: AudioContext | undefined;
        try {
            const file = await nextEntry.getFile();
            const data = await file.arrayBuffer();
            const assetKey = await fingerprintAudio(data);
            await registerModules();
            const previous = editorRef.current;
            nextContext = new AudioContext({ latencyHint: "interactive" });
            let modulesState: AudioToolkitModulesState | undefined;
            try { modulesState = JSON.parse(localStorage.getItem(MODULES_KEY) || "null") || undefined; } catch { /* ignore corrupt UI state */ }
            const nextEditor = await AudioEditor.fromData(
                data,
                nextContext,
                {},
                modulesState,
                assetKey,
                undefined,
                request => musicClient.analyze(file, request),
                request => musicClient.describe(file, request),
                request => musicClient.relevanceCurve(file, request)
            );
            nextEditor.on("modulesState", state => localStorage.setItem(MODULES_KEY, JSON.stringify(state)));
            editorRef.current = nextEditor;
            setEntry(nextEntry);
            setEditor(nextEditor);
            setOpeningAudio(false);
            if (previous) void previous.context.close();
        } catch (reason) {
            if (nextContext) void nextContext.close();
            setOpeningAudio(false);
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    }, [musicClient]);



    const saveSettings = () => {
        const normalizedMusic = { ...draftMusicSettings, baseUrl: draftMusicSettings.baseUrl.trim() || defaultMusicSettings.baseUrl };
        localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify({ baseUrl: normalizedMusic.baseUrl }));
        localStorage.setItem(MUSIC_TOKEN_KEY, normalizedMusic.token);
        sessionStorage.removeItem(MUSIC_TOKEN_KEY);
        setMusicSettings(normalizedMusic);
        setSettingsOpen(false);
    };

    return <div className="standalone-shell">
        <header className="app-header">
            <div className="brand"><span className="brand-mark">AT</span><div><strong>Audio Toolkit</strong><small>{t("Browser workspace")}</small></div></div>
            <div className="current-file">{entry ? <><span>{t("NOW INSPECTING")}</span><strong>{entry.name}</strong><small>{entry.path}</small></> : <span>{t("Choose an audio file from the library")}</span>}</div>
            <div className="app-header-actions">
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
            <FileExplorer activeId={entry?.id} onOpen={openEntry} />
            <div id="standalone-layers-host" />
        </aside>
        <main className="web-editor">
            {error && <div className="banner error-text"><strong>{t("Could not open audio")}</strong><span>{error}</span></div>}
            {openingAudio && <div className="loading-overlay"><span className="spinner" /><strong>{t("Reading local audio")}</strong></div>}
            {editor && entry ? <AudioEditorContext.Provider value={editor}><AudioEditorContainer standalone key={`${entry.id}:${editor.length}:${editor.sampleRate}`} /></AudioEditorContext.Provider> : <div className="welcome">
                <div className="welcome-wave">∿</div>
                <span className="eyebrow">{t("STANDALONE ANALYSIS WORKSPACE")}</span>
                <h1>{t("Open a folder.")}<br />{t("Listen closer.")}</h1>
                <p>{t("Files remain in the browser. Only audio you choose to analyze is sent to the configured backend.")}</p>
                <input ref={audioFileInput} className="hidden-input" type="file" accept="audio/*,.aif,.aiff" onChange={event => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void openEntry({ id: `single:${file.name}:${file.size}:${file.lastModified}`, name: file.name, path: file.name, getFile: async () => file });
                    event.currentTarget.value = "";
                }} />
                <button type="button" onClick={() => audioFileInput.current?.click()}>{t("Open one audio file")}</button>
                <div className="privacy-flow"><span>{t("Local folder")}</span><b>→</b><span>{t("Selected file")}</span><b>→</b><span>{t("Analysis API")}</span></div>
            </div>}
        </main>
    </div>;
};

export default StandaloneApp;
