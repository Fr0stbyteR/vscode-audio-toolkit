import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import { AnnotationDocument, isAnnotationDocument } from "../annotations/AnnotationModel";
import { listAnnotationDocuments } from "./PersistentStorage";
import { makeReviewBundle } from "./ReviewBundle";
import "./LocalReviewQueue.scss";
import { useLocale } from "../i18n/LocaleContext";

const LocalReviewQueue: FunctionComponent = () => {
    const { t } = useLocale();
    const [open, setOpen] = useState(false);
    const [documents, setDocuments] = useState<AnnotationDocument[]>([]);
    const [invalidCount, setInvalidCount] = useState(0);
    const [error, setError] = useState("");
    const refresh = useCallback(async () => {
        try {
            const stored = await listAnnotationDocuments<unknown>();
            setDocuments(stored.filter(isAnnotationDocument));
            setInvalidCount(stored.filter(value => !isAnnotationDocument(value)).length);
            setError("");
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    }, []);
    useEffect(() => {
        void refresh();
        window.addEventListener("audio-toolkit-annotations-changed", refresh);
        return () => window.removeEventListener("audio-toolkit-annotations-changed", refresh);
    }, [refresh]);
    const bundle = useMemo(() => makeReviewBundle(documents), [documents]);
    const exportBundle = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `audio-toolkit-review-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    return <section className={`local-review-queue${open ? " open" : ""}`}>
        <button type="button" className="review-queue-heading" onClick={() => setOpen(value => !value)} aria-expanded={open}>
            <span className={`codicon codicon-chevron-${open ? "down" : "right"}`} />
            <strong>{t("Review queue")}</strong><span>{bundle.summary.annotations}</span>
        </button>
        {open && <div className="review-queue-body">
            <div className="review-queue-counts"><span>{bundle.summary.files} {t("opened files")}</span><span>{bundle.summary.suggested} {t("suggested items")}</span><span>{bundle.summary.confirmed} {t("confirmed items")}</span></div>
            <p>{t("Only audio opened in this browser is listed; the whole folder is not scanned.")}</p>
            {error && <p className="review-queue-error">{error}</p>}
            {invalidCount > 0 && <p className="review-queue-error">{invalidCount} {t("unsupported local records were skipped.")}</p>}
            <div className="review-queue-list">{bundle.documents.map(item => {
                const pending = item.annotations.filter(annotation => annotation.state === "suggested" || annotation.state === "ambiguous").length;
                return <div className="review-queue-file" key={item.assetKey} title={item.filePath || item.fileName}>
                    <span className="codicon codicon-file-media" /><span className="review-queue-file-name">{item.filePath || item.fileName}</span><span>{pending ? `${pending} ${t("to review")}` : `${item.annotations.length} ${t("marks")}`}</span>
                </div>;
            })}</div>
            <button type="button" className="review-queue-export" disabled={!bundle.summary.files} onClick={exportBundle}>{t("Export review bundle")}</button>
            <small>{t("Includes annotations and sample fingerprints, not audio or tokens; this is not yet a training-ready snapshot.")}</small>
        </div>}
    </section>;
};

export default LocalReviewQueue;
