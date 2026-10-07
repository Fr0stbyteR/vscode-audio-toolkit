import { useEffect, useMemo, useState } from "react";
import { calculateRangeStatistics, formatStatistic, statisticsRange, StatisticsResult, StatisticsSource } from "../core/RangeStatistics";
import { useLocale } from "../i18n/LocaleContext";
import "../modules/librosa/SignalStatisticsData.scss";

const rows = [["mean", "Mean"], ["min", "Minimum"], ["max", "Maximum"], ["std", "Standard deviation"], ["rms", "RMS"]] as const;
// Cache a few recent ranges against the original data; GC releases old audio.
const cached = new WeakMap<object, Map<string, StatisticsResult>>();

export default function RangeStatisticsData({ source, selection, length, sampleRate }: {
    source?: StatisticsSource; selection?: [number, number] | null; length: number; sampleRate: number;
}) {
    const { t } = useLocale();
    const { range, selected } = statisticsRange(selection, length);
    const [binChoice, setBinChoice] = useState("all");
    const [resolved, setResolved] = useState<{ identity: object; key: string; result: StatisticsResult }>();
    const [error, setError] = useState(false);
    const identity = source?.kind === "vector" || source?.kind === "matrix" ? source.slices : source?.kind === "notes" ? source.notes : source?.markers;
    const matrix = source?.kind === "matrix" ? source : undefined;
    const bins = matrix?.slices[0]?.resizedMatrices.resizes[0]?.data[0]?.[0]?.length ?? 0;
    const bin = matrix && binChoice !== "all" && Number(binChoice) < bins ? Number(binChoice) : undefined;
    const key = `${range[0]}:${range[1]}:${selected}:${bin ?? "all"}:${sampleRate}`;
    // Cursor-only rerenders must not restart a full audio scan.
    const stable = useMemo(() => source, [identity, source?.kind, source && "metadata" in source ? source.metadata : undefined]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!stable || !identity) return;
        const controller = new AbortController();
        setError(false);
        const hit = cached.get(identity)?.get(key);
        if (hit) { setResolved({ identity, key, result: hit }); return; }
        const timer = setTimeout(() => {
            void calculateRangeStatistics(stable, [range[0], range[1]], sampleRate, { bin, includeEnd: !selected, signal: controller.signal }).then(result => {
                if (controller.signal.aborted) return;
                const entries = cached.get(identity) ?? new Map<string, StatisticsResult>();
                if (entries.size >= 8) entries.delete(entries.keys().next().value!);
                entries.set(key, result); cached.set(identity, entries);
                setResolved({ identity, key, result });
            }).catch(() => { if (!controller.signal.aborted) setError(true); });
        }, 100);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [stable, identity, key, range[0], range[1], sampleRate, bin, selected]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!source || !identity) return null;
    const result = resolved?.identity === identity && resolved.key === key ? resolved.result : undefined;
    return <div className="signal-statistics-data" aria-busy={!result && !error} title={source && "help" in source && source.help ? t(source.help) : undefined}>
        <div className="signal-statistics-heading"><strong>{t(selected ? "Selection statistics" : "Whole-audio statistics")}</strong><span>{(range[0] / sampleRate).toFixed(3)}–{(range[1] / sampleRate).toFixed(3)} s</span></div>
        {matrix && bins > 1 ? <label className="signal-statistics-bin">{t("Matrix values")}<select value={bin === undefined ? "all" : String(bin)} onChange={event => setBinChoice(event.target.value)}>
            <option value="all">{t("All bins")}</option>{Array.from({ length: bins }, (_, i) => <option key={i} value={i}>{matrix.binLabels?.[i] ?? `${t("Bin")} ${i + 1}`}</option>)}
        </select></label> : null}
        {!result ? <span className="signal-statistics-count">{t(error ? "Statistics unavailable" : "Calculating statistics…")}</span> : <>
            {result.points !== undefined ? <dl><div><dt>{t("Point markers")}</dt><dd>{result.points}</dd></div><div><dt>{t("Region markers")}</dt><dd>{result.regions}</dd></div><div><dt>{t("Covered time")}</dt><dd>{formatStatistic(result.coveredSeconds)} s</dd></div></dl> : null}
            {result.notes !== undefined ? <div className="signal-statistics-count">{t("Notes")}: {result.notes}</div> : null}
            {result.channels.map((channel, index) => <div className="signal-statistics-channel" key={index}>
                <div className="signal-statistics-count"><strong>{t(channel.label)}{channel.unit ? ` · ${t(channel.unit)}` : ""}</strong><span title={t("Finite valid observations; averages are not time-weighted. Matrix statistics use original values, not rendered colors.")}>{t("Values")}: {channel.summary.count}</span></div>
                <dl>{rows.map(([key, name]) => <div key={key}><dt>{t(name)}</dt><dd>{formatStatistic(channel.summary[key])}</dd></div>)}</dl>
            </div>)}
        </>}
    </div>;
}
