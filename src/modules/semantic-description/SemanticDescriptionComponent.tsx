import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import ConfigurationSections from "../../components/ConfigurationSections";
import { SemanticDescriptionResult } from "../../core/AudioEditor";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import SemanticDescription, { SemanticDescriptionState } from "./SemanticDescription";
import ClapRelevanceCurve from "./ClapRelevanceCurve";
import "./SemanticDescriptionComponent.scss";
import { useLocale } from "../../i18n/LocaleContext";

const FAMILY_HUES: Record<string, number> = {
    instrument: 205, voice: 328, technique: 28, texture: 265,
    affect: 48, production: 165, rhythm: 8, genre: 125
};
const FAMILY_ORDER = ["instrument", "voice", "technique", "texture", "rhythm", "affect", "production", "genre"];
const groupByFamily = <T extends { family: string }>(items: T[]) => {
    const families = [...new Set(items.map(item => item.family))].sort((a, b) => {
        const aIndex = FAMILY_ORDER.indexOf(a);
        const bIndex = FAMILY_ORDER.indexOf(b);
        return (aIndex < 0 ? FAMILY_ORDER.length : aIndex) - (bIndex < 0 ? FAMILY_ORDER.length : bIndex) || a.localeCompare(b);
    });
    return families.map(family => ({ family, items: items.filter(item => item.family === family) }));
};
const badgeStyle = (family: string, relevance: number): React.CSSProperties => ({
    "--badge-hue": FAMILY_HUES[family] ?? 205,
    "--button-secondary-background": `hsl(${FAMILY_HUES[family] ?? 205} 16% ${22 + relevance * 7}%)`,
    "--button-secondary-hover-background": `hsl(${FAMILY_HUES[family] ?? 205} 23% ${27 + relevance * 7}%)`,
    "--button-secondary-foreground": `hsl(${FAMILY_HUES[family] ?? 205} 25% 88%)`,
    "--button-border": `hsl(${FAMILY_HUES[family] ?? 205} 20% ${36 + relevance * 8}%)`,
    "--button-padding-horizontal": "8px",
    "--button-padding-vertical": "4px"
} as React.CSSProperties);

const SemanticDescriptionComponent: FunctionComponent<VisualizationOptions<SemanticDescription>> = props => {
    const { t } = useLocale();
    const { module, moduleState, playhead, selRange, configurationMode, overlayMode, activeLayer } = props;
    const [result, setResult] = useState<SemanticDescriptionResult | undefined>(() => module.lastResult);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [manualRevision, setManualRevision] = useState(0);
    const requestRevision = useRef(0);
    const handledManualRevision = useRef(0);
    const sampleRate = module.audioEditor.sampleRate;
    const duration = module.audioEditor.duration;
    const range = useMemo(() => {
        if (selRange && selRange[1] > selRange[0]) {
            return { start: selRange[0] / sampleRate, end: selRange[1] / sampleRate, source: "selection" as const };
        }
        const center = playhead / sampleRate;
        const half = moduleState.contextSeconds / 2;
        let start = Math.max(0, center - half);
        let end = Math.min(duration, center + half);
        if (end - start < moduleState.contextSeconds) {
            if (start === 0) end = Math.min(duration, moduleState.contextSeconds);
            else start = Math.max(0, duration - moduleState.contextSeconds);
        }
        return { start, end: Math.max(end, Math.min(duration, start + 0.05)), source: "cursor" as const };
    }, [duration, moduleState.contextSeconds, playhead, sampleRate, selRange]);

    useEffect(() => {
        if (!moduleState.autoAnalyze) {
            if (manualRevision === handledManualRevision.current) return;
            handledManualRevision.current = manualRevision;
        }
        const revision = ++requestRevision.current;
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError("");
            try {
                const request = {
                    startSeconds: range.start,
                    endSeconds: range.end,
                    timelineDurationSeconds: duration,
                    maximumResults: moduleState.maximumResults,
                    providerId: moduleState.providerId || undefined
                };
                const next = await module.audioEditor.describeSemantics(request);
                if (revision === requestRevision.current) {
                    module.rememberResult(request, next);
                    setResult(next);
                }
            } catch (reason) {
                if (revision === requestRevision.current) {
                    const message = reason instanceof Error ? reason.message : String(reason);
                    setError(message.includes("no loaded audio/text provider") || message.includes("is not loaded")
                        ? "No text-matching model is loaded. Load LAION-CLAP or MuQ-MuLan in music-embedding-analysis."
                        : message.includes("invalid session token") || message.includes("HTTP 401")
                            ? "Music embedding service rejected the request. Set the Bearer token shown when the service starts."
                        : message);
                }
            } finally {
                if (revision === requestRevision.current) setLoading(false);
            }
        }, range.source === "selection" ? 280 : 650);
        return () => window.clearTimeout(timer);
    }, [duration, manualRevision, module, moduleState.autoAnalyze, moduleState.maximumResults, moduleState.providerId, range]);

    const update = (change: Partial<SemanticDescriptionState>) => module.setState({ ...moduleState, ...change });
    const plotRelevance = async (keyword: string, prompts: string[]) => {
        const normalizedPrompts = [...new Set(prompts.map(value => value.trim()).filter(Boolean))];
        try {
            await module.audioEditor.addModule(ClapRelevanceCurve.MODULE_ID, {
                ...ClapRelevanceCurve.DEFAULT_STATE,
                name: keyword,
                keyword,
                prompts: normalizedPrompts.length ? normalizedPrompts : [keyword],
                providerId: moduleState.providerId
            }, `CLAP · ${keyword}`, true);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };
    const configurationContent = <ConfigurationSections mode={configurationMode} analysis={<div className="semantic-settings">
            <label>{t("Cursor context")} <span>{moduleState.contextSeconds.toFixed(1)} s</span><input type="range" min="1" max="20" step="0.5" value={moduleState.contextSeconds} onChange={event => update({ contextSeconds: +event.target.value })} /></label>
            <label>{t("Results")}<input type="number" min="1" max="20" value={moduleState.maximumResults} onChange={event => update({ maximumResults: Math.max(1, Math.min(20, +event.target.value || 1)) })} /></label>
            <label>{t("Provider")}<select value={moduleState.providerId} onChange={event => update({ providerId: event.target.value })}><option value="">{t("Auto")}</option><option value="laion_clap_music_htsat_base">LAION-CLAP</option><option value="muq_mulan_large">MuQ-MuLan</option><option value="mock">{t("Mock (test)")}</option></select></label>
            <label className="semantic-checkbox"><input type="checkbox" checked={moduleState.autoAnalyze} onChange={event => update({ autoAnalyze: event.target.checked })} />{t("Follow cursor and selection")}</label>
            <button onClick={() => setManualRevision(value => value + 1)}>{t("Analyze now")}</button>
        </div>} />;
    const monitorContent = <div className="semantic-monitor default-layout">
        <div><span>{t("Provider")}</span><strong>{result?.providerName || "—"}</strong></div>
        <div><span>{t("Descriptions")}</span><strong>{result?.descriptions.length ?? "—"}</strong></div>
    </div>;
    const inspectorConfigRoot = document.getElementById("inspector-config-root");
    const inspectorData = document.getElementById("inspector-data");
    const scores = result?.descriptions.map(item => item.score) ?? [];
    const minScore = scores.length ? Math.min(...scores) : 0;
    const maxScore = scores.length ? Math.max(...scores) : 1;
    const rawScores = result?.rawMatches?.map(item => item.cosineSimilarity) ?? [];
    const minRawScore = rawScores.length ? Math.min(...rawScores) : 0;
    const maxRawScore = rawScores.length ? Math.max(...rawScores) : 1;

    return <>
        <div className={`visualizer-component-container semantic-description-container${overlayMode ? " is-overlay" : ""}${activeLayer ? " is-active" : ""}`}>
            <div className="visualizer-component-visualization-area semantic-description-area">
                <div className="semantic-card">
                    {error ? <div className="semantic-error"><span className="codicon codicon-warning" /><div><strong>{t("Could not get a CLAP description")}</strong><span>{t(error)}</span></div></div> : null}
                    {!error && !result && loading ? <div className="semantic-empty"><span className="spinner" />{t("Matching candidate descriptions…")}</div> : null}
                    {!error && result ? <>
                        <div className="semantic-groups">{groupByFamily([...result.descriptions, ...(result.rawMatches ?? [])]).map(({ family }) => <section className="semantic-family-group" key={family}>
                            <h4>{t(family)}</h4><div className="semantic-family-badges">{result.descriptions.filter(item => item.family === family).map(item => {
                            const relevance = (item.score - minScore) / Math.max(0.001, maxScore - minScore);
                            return <VSCodeButton appearance="secondary" className="semantic-result" key={item.labelId}
                                style={badgeStyle(item.family, relevance)}
                                title={`${item.text} · ${t(item.family)} · ${t("similarity")} ${item.score.toFixed(3)} · ${t("Click to plot")}`}
                                onClick={() => void plotRelevance(item.text, (result.rawMatches ?? []).filter(match => match.labelId === item.labelId).map(match => match.prompt))}>
                                {item.text}
                            </VSCodeButton>;
                        })}</div>
                            {result.rawMatches?.some(item => item.family === family) ? <div className="semantic-family-raw">
                                <span>{t("Raw prompt matches")}</span><div className="semantic-family-badges">{result.rawMatches.filter(item => item.family === family).map((item, index) => {
                                const relevance = (item.cosineSimilarity - minRawScore) / Math.max(0.001, maxRawScore - minRawScore);
                                return <VSCodeButton appearance="secondary" className="semantic-result semantic-raw-badge" key={`${item.labelId}:${item.prompt}:${index}`}
                                    style={badgeStyle(item.family, relevance)}
                                    title={`${item.prompt} · ${t(item.family)} · ${t("similarity")} ${item.cosineSimilarity.toFixed(3)} · ${t("Click to plot")}`}
                                    onClick={() => void plotRelevance(item.prompt, [item.prompt])}>
                                    {item.prompt}
                                </VSCodeButton>;
                            })}</div></div> : null}
                        </section>)}</div>
                        {loading ? <span className="semantic-updating">{t("Updating…")}</span> : null}
                    </> : null}
                </div>
            </div>
        </div>
        {inspectorConfigRoot ? (activeLayer ? createPortal(configurationContent, inspectorConfigRoot) : null) : <div className="visualizer-component-configuration">{configurationContent}</div>}
        {inspectorData ? (activeLayer ? createPortal(monitorContent, inspectorData) : null) : <div className="visualizer-component-monitor">{monitorContent}</div>}
    </>;
};

export default SemanticDescriptionComponent;
