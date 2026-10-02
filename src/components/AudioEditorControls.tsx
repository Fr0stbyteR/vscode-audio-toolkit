import "./AudioEditorControls.scss";
import { FunctionComponent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AudioEditorContext } from "./contexts";
import AudioEditor, { AudioEditorConfiguration, AudioEditorState } from "../core/AudioEditor";
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";
import TimeInput from "./TimeInput";
import { useLocale } from "../i18n/LocaleContext";
import { cachedModuleForModule, cachedModulesToAdd } from "../core/AnalysisCache";

interface Props extends Pick<AudioEditorState, "playing" | "playhead" | "loop"> {
    configuration: AudioEditorConfiguration;
}

const AudioEditorControls: FunctionComponent<Props> = ({ playhead, playing, loop, configuration }) => {
    const { t, locale } = useLocale();
    const audioEditor = useContext(AudioEditorContext)!;
    const handlePlayheadChanged = (playhead: number) => audioEditor.setPlayhead(playhead);
    const [playheadBeforePlay, setPlayheadBeforePlay] = useState(playhead);
    const [cachedAnalyses, setCachedAnalyses] = useState(audioEditor.cachedAnalyses);
    const [cachedModuleStates, setCachedModuleStates] = useState(audioEditor.cachedModuleStates);
    const [addingCached, setAddingCached] = useState(false);
    const [addError, setAddError] = useState("");
    const mounted = useRef(true);
    const batchRunning = useRef(false);
    useEffect(() => {
        mounted.current = true;
        audioEditor.on("analysisCache", setCachedAnalyses);
        audioEditor.on("moduleCache", setCachedModuleStates);
        return () => { mounted.current = false; audioEditor.off("analysisCache", setCachedAnalyses); audioEditor.off("moduleCache", setCachedModuleStates); };
    }, [audioEditor]);
    const cachedToAdd = cachedModulesToAdd(AudioEditor.MODULES_MAP, cachedAnalyses, audioEditor.modulesState, cachedModuleStates);
    const cachedBatchLabel = `${t("Add all cached modules")}${cachedToAdd.length ? ` (${cachedToAdd.length})` : ""}`;
    const handleClickPlay = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        if (audioEditor.context.state === "suspended") audioEditor.context.resume();
        if (playing === "playing") {
            audioEditor.setPlayhead(playheadBeforePlay);
            audioEditor.play();
        } else {
            setPlayheadBeforePlay(playhead);
            if (playing === "paused") audioEditor.resume();
            else audioEditor.play();
        }
    }, [audioEditor, playing, playheadBeforePlay, playhead]);
    const handleClickStop = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        audioEditor.stop();
    }, [audioEditor]);
    const handleClickPause = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        if (playing === "paused") audioEditor.resume();
        else audioEditor.pause();
    }, [audioEditor, playing]);
    const handleClickLoop = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        audioEditor.setLoop(!loop);
    }, [audioEditor, loop]);
    const { sampleRate } = audioEditor;
    const handleAddModuleInput = (e: React.FormEvent<HTMLInputElement>) => {
        const moduleId = e.currentTarget.value;
        if (moduleId === "none" || batchRunning.current) return;
        e.currentTarget.value = "none";
        setAddError("");
        if (moduleId === "cached-all") {
            batchRunning.current = true;
            setAddingCached(true);
            void (async () => {
                try {
                    // Sequential hydration avoids concurrent copies of large matrices.
                    for (const entry of cachedToAdd) {
                        if (!mounted.current) break;
                        if (audioEditor.modulesState.some(module => module.moduleId === entry.moduleId)) continue;
                        const instance = await audioEditor.addModule(entry.moduleId, entry.state);
                        if (!mounted.current) { instance.dispose?.(); break; }
                        await instance.analysisComplete;
                    }
                } catch (reason) { if (mounted.current) setAddError(reason instanceof Error ? reason.message : String(reason)); }
                finally { batchRunning.current = false; if (mounted.current) setAddingCached(false); }
            })();
        } else {
            void audioEditor.addModule(moduleId).catch(reason => { if (mounted.current) setAddError(reason instanceof Error ? reason.message : String(reason)); });
        }
    };
    return (
        <div className="editor-main-controls">
            <span className="editor-main-player-controls-container">
                <span className="editor-main-player-controls">
                    <VSCodeButton tabIndex={-1} title={t("Stop")} disabled={playing === "stopped"} appearance="icon" onClick={handleClickStop}>
                        <span className="codicon codicon-debug-stop"></span>
                    </VSCodeButton>
                    <VSCodeButton tabIndex={-1} title={t("Play")} appearance="icon" onClick={handleClickPlay}>
                        <span className="codicon codicon-play"></span>
                    </VSCodeButton>
                    <VSCodeButton tabIndex={-1} title={t("Pause")} appearance="icon" disabled={playing === "stopped"} onClick={handleClickPause}>
                        {playing === "paused" ? <span className="codicon codicon-debug-continue-small"></span> : <span className="codicon codicon-debug-pause"></span>}
                    </VSCodeButton>
                    <VSCodeButton tabIndex={-1} title={t("Loop")} appearance="icon" className={loop ? "active" : ""} onClick={handleClickLoop}>
                        <span className="codicon codicon-refresh"></span>
                    </VSCodeButton>
                </span>
            </span>
            <span className="editor-add-component">
                <VSCodeDropdown key={locale} className="editor-add-component-dropdown" value="none" disabled={addingCached} aria-busy={addingCached} onInput={handleAddModuleInput}>
                    <VSCodeOption value="none">{t("Add a Module")}</VSCodeOption>
                    <VSCodeOption value="cached-all" className="cached-module-batch" aria-label={cachedBatchLabel} disabled={!cachedToAdd.length}>{cachedBatchLabel}</VSCodeOption>
                    {
                        Object.keys(AudioEditor.MODULES_MAP).map(moduleId => {
                            const cached = cachedModuleForModule(moduleId, AudioEditor.MODULES_MAP[moduleId], cachedAnalyses, cachedModuleStates);
                            return <VSCodeOption key={moduleId} value={moduleId} aria-label={t(AudioEditor.MODULES_MAP[moduleId].MODULE_NAME)} className={cached ? "module-cached" : "module-uncached"} title={t(cached ? "Local analysis available" : "No local analysis available")}>
                                {cached ? <span className="codicon codicon-check" aria-hidden="true" /> : null}{t(AudioEditor.MODULES_MAP[moduleId].MODULE_NAME)}
                            </VSCodeOption>;
                        })
                    }
                </VSCodeDropdown>
            </span>
            <TimeInput samples={playhead} sampleRate={sampleRate} {...configuration} onChange={handlePlayheadChanged} />
            {addError ? <span className="module-add-error" role="alert">{addError}</span> : null}
        </div>
    );
};

export default AudioEditorControls;
