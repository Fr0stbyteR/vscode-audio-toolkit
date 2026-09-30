import { FunctionComponent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import { audioTimeAtScore, interpolate, scoreTimeAtAudio } from "./Alignment";
import { selectAlignmentGuides } from "./AlignmentGuides";
import { MusicScore } from "./ScoreModule";
import { useScoreWorkspace } from "./useScoreWorkspace";
import ScoreControls from "./ScoreControls";
import { ScoreEvent } from "./ScoreLibrary";
import "./ScoreModules.scss";
import { useLocale } from "../../i18n/LocaleContext";

interface PositionedEvent extends ScoreEvent { x: number; }

function measureStartX(measure: Element, svgRect: DOMRect): number {
    let previous = measure.previousElementSibling;
    while (previous && !previous.matches("g.measure")) previous = previous.previousElementSibling;
    const previousBarlines = previous?.querySelectorAll(":scope > g.barLine");
    const previousBarline = previousBarlines?.[previousBarlines.length - 1];
    if (previousBarline) {
        const rect = previousBarline.getBoundingClientRect();
        return rect.left - svgRect.left + rect.width / 2;
    }
    const firstStaffLine = measure.querySelector(":scope > g.staff > path");
    return (firstStaffLine ?? measure).getBoundingClientRect().left - svgRect.left;
}

function sanitizeSvg(svg: string): string {
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const dimensions = document.documentElement.getAttribute("viewBox")?.split(/\s+/).map(Number);
    if (dimensions?.length === 4 && dimensions.every(Number.isFinite)) {
        document.documentElement.setAttribute("width", String(Math.ceil(dimensions[2])));
        document.documentElement.setAttribute("height", String(Math.ceil(dimensions[3])));
    }
    document.querySelectorAll("script, foreignObject, image").forEach(element => element.remove());
    document.querySelectorAll("*").forEach(element => {
        for (const attribute of Array.from(element.attributes)) {
            if (/^on/i.test(attribute.name) || ((attribute.name === "href" || attribute.name === "xlink:href") && !attribute.value.startsWith("#"))) element.removeAttribute(attribute.name);
        }
    });
    return new XMLSerializer().serializeToString(document.documentElement);
}

const MusicScoreComponent: FunctionComponent<VisualizationOptions<MusicScore>> = props => {
    const { t } = useLocale();
    const { module, moduleState, playhead, viewRange, activeLayer, configurationMode } = props;
    const { score, busy, error, alignment, currentState, importFile, autoAlign, addAnchor, clearAnchors } = useScoreWorkspace(module, moduleState);
    const viewportRef = useRef<HTMLDivElement>(null);
    const svgHostRef = useRef<HTMLDivElement>(null);
    const [positions, setPositions] = useState<PositionedEvent[]>([]);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [selectedTime, setSelectedTime] = useState<number>();
    useEffect(() => setSelectedTime(undefined), [moduleState.scoreKey]);
    const safeSvg = useMemo(() => score?.svg ? sanitizeSvg(score.svg) : "", [score?.svg]);
    const updatePositions = useCallback(() => {
        const viewport = viewportRef.current;
        const svg = svgHostRef.current?.querySelector("svg");
        if (!viewport || !svg || !score) return;
        const svgRect = svg.getBoundingClientRect();
        const byId = new Map(Array.from(svg.querySelectorAll("[id]")).map(element => [element.id, element]));
        setPositions(score.events.flatMap(event => {
            const element = byId.get(event.id);
            if (!element || (event.kind === "note" && !element.matches("g.note"))) return [];
            const rect = element.getBoundingClientRect();
            const x = event.kind === "measure" ? measureStartX(element, svgRect) : rect.left - svgRect.left + rect.width / 2;
            return [{ ...event, x }];
        }).sort((a, b) => a.time - b.time || a.x - b.x));
        setViewportWidth(viewport.clientWidth);
    }, [score]);
    useEffect(() => {
        const frame = requestAnimationFrame(updatePositions);
        const observer = new ResizeObserver(updatePositions);
        if (viewportRef.current) observer.observe(viewportRef.current);
        if (svgHostRef.current) observer.observe(svgHostRef.current);
        return () => { cancelAnimationFrame(frame); observer.disconnect(); };
    }, [safeSvg, updatePositions]);
    const timePositions = useMemo(() => {
        const distinct: PositionedEvent[] = [];
        for (const event of positions) if (!distinct.length || event.time - distinct[distinct.length - 1].time > 0.015) distinct.push(event);
        return distinct;
    }, [positions]);
    const positionMap = useMemo(() => timePositions.map(point => ({ scoreTime: point.time, audioTime: point.x })), [timePositions]);
    const scoreX = useCallback((time: number) => interpolate(positionMap, time, "scoreTime", "audioTime"), [positionMap]);
    const scoreTime = scoreTimeAtAudio(alignment, playhead / module.audioEditor.sampleRate);
    const playheadX = scoreX(scoreTime);
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || !positions.length) return;
        const destination = Math.max(0, playheadX - viewport.clientWidth * 0.42);
        if (Math.abs(viewport.scrollLeft - destination) > 1) viewport.scrollLeft = destination;
        setScrollLeft(viewport.scrollLeft);
    }, [playheadX, positions.length]);
    const [viewStart, viewEnd] = viewRange;
    const visibleEvents = positions.filter(event => event.x >= scrollLeft - 10 && event.x <= scrollLeft + viewportWidth + 10);
    const alignmentCandidates = visibleEvents.map(event => {
        const audioTime = audioTimeAtScore(alignment, event.time);
        const audioX = (audioTime * module.audioEditor.sampleRate - viewStart) / Math.max(1, viewEnd - viewStart) * viewportWidth;
        return { ...event, audioX, scoreX: event.x - scrollLeft };
    }).filter(event => event.audioX >= 0 && event.audioX <= viewportWidth);
    const alignmentLines = selectAlignmentGuides(alignmentCandidates);
    const selectedEvent = selectedTime === undefined ? undefined : timePositions.find(event => Math.abs(event.time - selectedTime) < 0.01);
    const handleScoreClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = (event.target as Element).closest<SVGElement>("g.note[id], g.measure[id]");
        if (!target) return;
        const found = positions.find(position => position.id === target.id);
        if (!found) return;
        setSelectedTime(found.time);
        if (!event.altKey) module.audioEditor.setPlayhead(Math.round(audioTimeAtScore(alignment, found.time) * module.audioEditor.sampleRate));
    };
    const addCompanion = () => void module.audioEditor.addModule("score.pianoroll", { ...moduleState }, "Piano roll", true);
    return <>
        <div className="visualizer-component-container music-score-module">
            {!score ? <div className="score-empty">{error ? <span role="alert">{t(error)}</span> : busy ? `${t(busy)}…` : t("Import MusicXML to display a score")}</div> : <>
                <div className="score-alignment-strip">
                    <svg width="100%" height="42" viewBox={`0 0 ${Math.max(1, viewportWidth)} 42`} preserveAspectRatio="none" aria-label={t("Score alignment map")}>
                        {alignmentLines.map(event => <g key={event.id} className={event.kind}><line x1={event.audioX} y1="0" x2={event.scoreX} y2="40" /><title>{event.kind === "measure" ? `${t("Measure")} ${event.label ?? ""}` : t("Score note")} · {event.time.toFixed(2)} s</title></g>)}
                        <line className="score-audio-cursor" x1={(playhead - viewStart) / Math.max(1, viewEnd - viewStart) * viewportWidth} y1="0" x2={(playhead - viewStart) / Math.max(1, viewEnd - viewStart) * viewportWidth} y2="42" />
                    </svg>
                </div>
                <div className="score-scroll" ref={viewportRef} onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
                    <div className="score-svg" ref={svgHostRef} onClick={handleScoreClick} dangerouslySetInnerHTML={{ __html: safeSvg }} />
                    <div className="score-note-cursor" style={{ left: playheadX }} />
                    {selectedEvent ? <div className="score-selected-note" style={{ left: selectedEvent.x }} /> : null}
                </div>
            </>}
        </div>
        <ScoreControls state={currentState} score={score} busy={busy} error={error} selectedTime={selectedTime} playheadSeconds={playhead / module.audioEditor.sampleRate} mode={configurationMode} activeLayer={activeLayer} moduleKind="score" onImport={file => void importFile(file)} onAutoAlign={() => void autoAlign()} onAnchor={addAnchor} onClearAnchors={clearAnchors} onAddCompanion={addCompanion} />
    </>;
};

export default MusicScoreComponent;
