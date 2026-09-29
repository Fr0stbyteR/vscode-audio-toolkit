import { FunctionComponent, useContext } from "react";
import { AnnotationContext } from "./AnnotationContext";
import "./AnnotationTimeline.scss";
import { useLocale } from "../i18n/LocaleContext";

interface Props {
    viewRange: [number, number];
    sampleRate: number;
}

const AnnotationTimeline: FunctionComponent<Props> = ({ viewRange, sampleRate }) => {
    const { t } = useLocale();
    const session = useContext(AnnotationContext);
    if (!session || !session.annotations.length) return null;
    const [start, end] = viewRange;
    const span = Math.max(1, end - start);
    const visible = session.annotations.filter(item => item.state !== "rejected" && item.endSample > start && item.startSample < end);
    return <div className="annotation-timeline" aria-label={t("Annotation timeline")}>
        <span className="annotation-timeline-icon codicon codicon-tag" title={t("Annotations: upper row reviewed, lower row suggestions")} />
        <div className="annotation-timeline-rail">
            {visible.map(item => {
                const left = Math.max(0, (item.startSample - start) / span * 100);
                const right = Math.min(100, (item.endSample - start) / span * 100);
                return <button type="button" key={item.id} className={`annotation-timeline-item ${item.state}${session.selectedId === item.id ? " selected" : ""}`}
                    style={{ left: `${left}%`, width: `${Math.max(0.35, right - left)}%` }}
                    title={`${item.label} · ${(item.startSample / sampleRate).toFixed(2)}–${(item.endSample / sampleRate).toFixed(2)} s · ${t(item.state)}`}
                    aria-label={`${t("Select annotation")} ${item.label}`}
                    onClick={() => session.focus(item.id)}>{item.label}</button>;
            })}
        </div>
    </div>;
};

export default AnnotationTimeline;
