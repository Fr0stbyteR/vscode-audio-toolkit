import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";
import { SemanticDescriptionResult } from "../../core/AudioEditor";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import SemanticDescription, { SemanticDescriptionState } from "./SemanticDescription";
import "./SemanticDescriptionComponent.scss";

const FAMILY_NAMES: Record<string, string> = {
    instrument: "乐器", voice: "人声", technique: "演奏法", texture: "织体",
    affect: "情绪", production: "制作", rhythm: "律动", genre: "风格"
};

const SemanticDescriptionComponent: FunctionComponent<VisualizationOptions<SemanticDescription>> = props => {
    const { module, moduleState, playhead, selRange, configurationMode, overlayMode, activeLayer } = props;
    const [result, setResult] = useState<SemanticDescriptionResult>();
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
                const next = await module.audioEditor.describeSemantics({
                    startSeconds: range.start,
                    endSeconds: range.end,
                    timelineDurationSeconds: duration,
                    maximumResults: moduleState.maximumResults,
                    providerId: moduleState.providerId || undefined
                });
                if (revision === requestRevision.current) setResult(next);
            } catch (reason) {
                if (revision === requestRevision.current) {
                    const message = reason instanceof Error ? reason.message : String(reason);
                    setError(message.includes("no loaded audio/text provider") || message.includes("is not loaded")
                        ? "尚未加载可进行文字匹配的模型。请在 music-embedding-analysis 中加载 LAION-CLAP 或 MuQ-MuLan。"
                        : message.includes("invalid session token") || message.includes("HTTP 401")
                            ? "Music embedding service 拒绝了请求，请在右上角设置服务启动时输出的 Bearer token。"
                        : message);
                }
            } finally {
                if (revision === requestRevision.current) setLoading(false);
            }
        }, range.source === "selection" ? 280 : 650);
        return () => window.clearTimeout(timer);
    }, [duration, manualRevision, module, moduleState.autoAnalyze, moduleState.maximumResults, moduleState.providerId, range]);

    const update = (change: Partial<SemanticDescriptionState>) => module.setState({ ...moduleState, ...change });
    const configurationContent = configurationMode === "appearance"
        ? <div className="semantic-settings"><div className="configuration-kind"><strong>Appearance</strong><span>此模块会自动使用编辑器主题色。</span></div></div>
        : <div className="semantic-settings">
            <div className="configuration-kind"><strong>CLAP analysis</strong><span>改变这些设置会重新进行文字匹配。</span></div>
            <label>Cursor context <span>{moduleState.contextSeconds.toFixed(1)} s</span><input type="range" min="1" max="20" step="0.5" value={moduleState.contextSeconds} onChange={event => update({ contextSeconds: +event.target.value })} /></label>
            <label>Results<input type="number" min="1" max="20" value={moduleState.maximumResults} onChange={event => update({ maximumResults: Math.max(1, Math.min(20, +event.target.value || 1)) })} /></label>
            <label>Provider<select value={moduleState.providerId} onChange={event => update({ providerId: event.target.value })}><option value="">Auto</option><option value="laion_clap_music_htsat_base">LAION-CLAP</option><option value="muq_mulan_large">MuQ-MuLan</option><option value="mock">Mock (test)</option></select></label>
            <label className="semantic-checkbox"><input type="checkbox" checked={moduleState.autoAnalyze} onChange={event => update({ autoAnalyze: event.target.checked })} />Follow cursor and selection</label>
            <label className="semantic-checkbox"><input type="checkbox" checked={moduleState.showRawOutput} onChange={event => update({ showRawOutput: event.target.checked })} />Show raw prompt matches</label>
            <button onClick={() => setManualRevision(value => value + 1)}>Analyze now</button>
        </div>;
    const monitorContent = <div className="semantic-monitor default-layout">
        <div><span>Provider</span><strong>{result?.providerName || "—"}</strong></div>
        <div><span>Cache</span><strong>{result ? (result.cached ? "Hit" : "Miss") : "—"}</strong></div>
    </div>;

    return <>
        <div className={`visualizer-component-container semantic-description-container${overlayMode ? " is-overlay" : ""}${activeLayer ? " is-active" : ""}`}>
            <div className="visualizer-component-visualization-area semantic-description-area">
                <div className="semantic-card">
                    {error ? <div className="semantic-error"><span className="codicon codicon-warning" /><div><strong>无法取得 CLAP 描述</strong><span>{error}</span></div></div> : null}
                    {!error && !result && loading ? <div className="semantic-empty"><span className="spinner" />正在匹配候选文字…</div> : null}
                    {!error && result ? <>
                        <div className="semantic-summary"><span>CLAP suggests</span><strong>{result.summary}</strong>{loading ? <small>正在更新…</small> : result.cached ? <small>缓存</small> : null}</div>
                        {moduleState.showRawOutput ? <div className="semantic-raw">
                            <div className="semantic-raw-note"><strong>Raw prompt similarities</strong><span>CLAP 的模型输出是 embedding。这里展示 embedding 与每条候选 prompt 直接计算的分数，尚未合并成中文标签。</span></div>
                            {(result.rawMatches ?? []).map((item, index) => <div className="semantic-raw-row" key={`${item.labelId}:${item.prompt}`}>
                                <span className="semantic-rank">{index + 1}</span>
                                <span className="semantic-prompt">{item.prompt}</span>
                                <span className="semantic-family">{FAMILY_NAMES[item.family] || item.family}</span>
                                <strong title={`Mapped score: ${item.score.toFixed(4)}`}>{item.cosineSimilarity.toFixed(4)}</strong>
                            </div>)}
                        </div> : <div className="semantic-results">{result.descriptions.map(item => <div className="semantic-result" key={item.labelId} title={`${item.text}: ${(item.score * 100).toFixed(1)}% similarity`}>
                                <div><strong>{item.text}</strong><span>{FAMILY_NAMES[item.family] || item.family}</span></div>
                                <div className="semantic-score"><i style={{ width: `${Math.max(2, item.score * 100)}%` }} /><span>{Math.round(item.score * 100)}</span></div>
                            </div>)}</div>}
                        <div className="semantic-disclaimer">数值是文字与音频的相似度，用于排序，并非识别概率。</div>
                    </> : null}
                </div>
            </div>
        </div>
        <div className="visualizer-component-configuration">{configurationContent}</div>
        <div className="visualizer-component-monitor">{monitorContent}</div>
    </>;
};

export default SemanticDescriptionComponent;
