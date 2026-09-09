import "@vscode/codicons/dist/codicon.css";
import { FunctionComponent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AudioEditor from "../core/AudioEditor";
import AudioEditorContainer from "../components/AudioEditorContainer";
import { AudioEditorContext } from "../components/contexts";
import { AudioToolkitModulesState } from "../core/AudioToolkitModule";
import BackendClient, { BackendSettings } from "./BackendClient";
import MusicAnalysisClient from "./MusicAnalysisClient";
import FileExplorer from "./FileExplorer";
import { LocalAudioEntry } from "./types";
import getLibrosaModules from "../modules/librosa";
import getMarkerModules from "../modules/marker";
import getSpectrogramModules from "../modules/spectrogram";
import getWaveformModules from "../modules/waveform";
import getSemanticDescriptionModules from "../modules/semantic-description";
import "../vscode.css";
import "./standalone.css";

const SETTINGS_KEY = "audioToolkit.web.backend";
const TOKEN_KEY = "audioToolkit.web.token";
const MODULES_KEY = "audioToolkit.web.modules";
const MUSIC_SETTINGS_KEY = "audioToolkit.web.musicBackend";
const MUSIC_TOKEN_KEY = "audioToolkit.web.musicToken";

async function registerModules() {
    if (Object.keys(AudioEditor.MODULES_MAP).length) return;
    const groups = await Promise.all([getWaveformModules(), getSpectrogramModules(), getMarkerModules(), getLibrosaModules(), getSemanticDescriptionModules()]);
    groups.flat().forEach(Module => AudioEditor.MODULES_MAP[Module.MODULE_ID] = Module);
}

const defaultSettings: BackendSettings = {
    baseUrl: import.meta.env.VITE_AUDIO_TOOLKIT_API || "http://127.0.0.1:8000/",
    token: import.meta.env.VITE_AUDIO_TOOLKIT_TOKEN || ""
};

const defaultMusicSettings: BackendSettings = {
    baseUrl: import.meta.env.VITE_MUSIC_ANALYSIS_API || "http://127.0.0.1:49321/",
    token: import.meta.env.VITE_MUSIC_ANALYSIS_TOKEN || ""
};

const StandaloneApp: FunctionComponent = () => {
    const [settings, setSettings] = useState<BackendSettings>(() => {
        try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"), token: localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "" }; }
        catch { return defaultSettings; }
    });
    const [draftSettings, setDraftSettings] = useState(settings);
    const [musicSettings, setMusicSettings] = useState<BackendSettings>(() => {
        try { return { ...defaultMusicSettings, ...JSON.parse(localStorage.getItem(MUSIC_SETTINGS_KEY) || "{}"), token: localStorage.getItem(MUSIC_TOKEN_KEY) || sessionStorage.getItem(MUSIC_TOKEN_KEY) || "" }; }
        catch { return defaultMusicSettings; }
    });
    const [draftMusicSettings, setDraftMusicSettings] = useState(musicSettings);
    const client = useMemo(() => new BackendClient(settings), [settings]);
    const musicClient = useMemo(() => new MusicAnalysisClient(musicSettings), [musicSettings]);
    const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
    const [musicBackendStatus, setMusicBackendStatus] = useState<"checking" | "online" | "idle" | "offline">("checking");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [editor, setEditor] = useState<AudioEditor | null>(null);
    const editorRef = useRef<AudioEditor | null>(null);
    const [entry, setEntry] = useState<LocalAudioEntry>();
    const [loading, setLoading] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (settings.token) localStorage.setItem(TOKEN_KEY, settings.token);
        if (musicSettings.token) localStorage.setItem(MUSIC_TOKEN_KEY, musicSettings.token);
    }, [musicSettings.token, settings.token]);

    useEffect(() => {
        let active = true;
        setBackendStatus("checking");
        client.health().then(() => active && setBackendStatus("online")).catch(() => active && setBackendStatus("offline"));
        return () => { active = false; };
    }, [client]);

    useEffect(() => {
        let active = true;
        setMusicBackendStatus("checking");
        musicClient.health().then(capabilities => {
            if (!active) return;
            const loaded = capabilities.providers.some(provider => provider.loaded && provider.supportsTextEmbeddings);
            setMusicBackendStatus(loaded ? "online" : "idle");
        }).catch(() => active && setMusicBackendStatus("offline"));
        return () => { active = false; };
    }, [musicClient]);

    useEffect(() => () => { void editorRef.current?.context.close(); }, []);

    useEffect(() => {
        if (!editor) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.composedPath()[0] as HTMLElement | undefined;
            if (target?.matches?.("input, textarea, select, vscode-text-field, vscode-dropdown, [contenteditable=true]")) return;
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
        setLoading("Reading local audio");
        try {
            const file = await nextEntry.getFile();
            const data = await file.arrayBuffer();
            await registerModules();
            const previous = editorRef.current;
            const context = new AudioContext({ latencyHint: "interactive" });
            let modulesState: AudioToolkitModulesState | undefined;
            try { modulesState = JSON.parse(localStorage.getItem(MODULES_KEY) || "null") || undefined; } catch { /* ignore corrupt UI state */ }
            const nextEditor = await AudioEditor.fromData(
                data,
                context,
                {},
                modulesState,
                undefined,
                undefined,
                request => client.analyze(file, request, setLoading),
                request => musicClient.describe(file, request)
            );
            nextEditor.on("modulesState", state => localStorage.setItem(MODULES_KEY, JSON.stringify(state)));
            editorRef.current = nextEditor;
            setEntry(nextEntry);
            setEditor(nextEditor);
            setLoading("");
            if (previous) void previous.context.close();
        } catch (reason) {
            setLoading("");
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    }, [client, musicClient]);

    const saveSettings = () => {
        const normalized = { ...draftSettings, baseUrl: draftSettings.baseUrl.trim() || defaultSettings.baseUrl };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ baseUrl: normalized.baseUrl }));
        localStorage.setItem(TOKEN_KEY, normalized.token);
        sessionStorage.removeItem(TOKEN_KEY);
        const normalizedMusic = { ...draftMusicSettings, baseUrl: draftMusicSettings.baseUrl.trim() || defaultMusicSettings.baseUrl };
        localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify({ baseUrl: normalizedMusic.baseUrl }));
        localStorage.setItem(MUSIC_TOKEN_KEY, normalizedMusic.token);
        sessionStorage.removeItem(MUSIC_TOKEN_KEY);
        setSettings(normalized);
        setMusicSettings(normalizedMusic);
        setSettingsOpen(false);
    };

    return <div className="standalone-shell">
        <header className="app-header">
            <div className="brand"><span className="brand-mark">AT</span><div><strong>Audio Toolkit</strong><small>Browser workspace</small></div></div>
            <div className="current-file">{entry ? <><span>NOW INSPECTING</span><strong>{entry.name}</strong><small>{entry.path}</small></> : <span>Choose an audio file from the library</span>}</div>
            <button className="backend-button" onClick={() => setSettingsOpen(value => !value)}>
                <span className={`status-dot ${backendStatus}`} />
                {backendStatus === "online" ? "Audio ready" : backendStatus === "checking" ? "Checking audio" : "Audio offline"}
                <span className={`status-dot ${musicBackendStatus}`} />
                {musicBackendStatus === "online" ? "CLAP loaded" : musicBackendStatus === "idle" ? "Load CLAP" : musicBackendStatus === "checking" ? "Checking CLAP" : "CLAP offline"}
                <span className="codicon codicon-settings-gear" />
            </button>
        </header>
        {settingsOpen && <section className="backend-popover">
            <strong>Librosa service</strong>
            <label>API base URL<input value={draftSettings.baseUrl} onChange={event => setDraftSettings(value => ({ ...value, baseUrl: event.target.value }))} placeholder="https://analysis.example.com/" /></label>
            <label>Bearer token <span>(saved in this browser)</span><input type="password" value={draftSettings.token} onChange={event => setDraftSettings(value => ({ ...value, token: event.target.value }))} /></label>
            <strong>Music embedding service</strong>
            <label>API base URL<input value={draftMusicSettings.baseUrl} onChange={event => setDraftMusicSettings(value => ({ ...value, baseUrl: event.target.value }))} placeholder="http://127.0.0.1:49321/" /></label>
            <label>Bearer token <span>(saved in this browser)</span><input type="password" value={draftMusicSettings.token} onChange={event => setDraftMusicSettings(value => ({ ...value, token: event.target.value }))} /></label>
            <div><button className="secondary" onClick={() => setSettingsOpen(false)}>Cancel</button><button onClick={saveSettings}>Connect</button></div>
        </section>}
        <FileExplorer activeId={entry?.id} onOpen={openEntry} />
        <main className="web-editor">
            {error && <div className="banner error-text"><strong>Could not open audio</strong><span>{error}</span></div>}
            {loading && <div className="loading-overlay"><span className="spinner" /><strong>{loading}</strong></div>}
            {editor ? <AudioEditorContext.Provider value={editor}><AudioEditorContainer key={`${entry?.id}:${editor.length}:${editor.sampleRate}`} /></AudioEditorContext.Provider> : <div className="welcome">
                <div className="welcome-wave">∿</div>
                <span className="eyebrow">STANDALONE ANALYSIS WORKSPACE</span>
                <h1>Open a folder.<br />Listen closer.</h1>
                <p>目录留在浏览器。只有你选择分析的音频会发送到已配置的后端。</p>
                <div className="privacy-flow"><span>Local folder</span><b>→</b><span>Selected file</span><b>→</b><span>Analysis API</span></div>
            </div>}
        </main>
    </div>;
};

export default StandaloneApp;
