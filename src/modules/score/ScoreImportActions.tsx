import { useRef } from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { useLocale } from "../../i18n/LocaleContext";
export default function ScoreImportActions({ kind, busy, onImport, onOmr }: { kind: "score" | "pianoroll"; busy?: boolean; onImport(file: File): void; onOmr?(file: File): void }) {
    const { t } = useLocale();
    const scoreInput = useRef<HTMLInputElement>(null), scanInput = useRef<HTMLInputElement>(null);
    return <><input ref={scoreInput} type="file" className="hidden-input" accept={kind === "score" ? ".musicxml,.xml,.mxl" : ".musicxml,.xml,.mxl,.mid,.midi"} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) onImport(file); }} />
        <VSCodeButton disabled={busy} onClick={() => scoreInput.current?.click()}>{t(kind === "score" ? "Import MusicXML" : "Import MusicXML / MIDI")}</VSCodeButton>
        {onOmr && <><input ref={scanInput} type="file" className="hidden-input" accept=".png,.jpg,.jpeg,.webp,.tif,.tiff,.pdf" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) onOmr(file); }} /><VSCodeButton appearance="secondary" disabled={busy} onClick={() => scanInput.current?.click()}>{t("Image / PDF → MusicXML")}</VSCodeButton></>}
    </>;
}
