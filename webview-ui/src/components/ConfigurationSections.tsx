import { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
    mode: "analysis" | "appearance" | "both";
    analysis?: ReactNode;
    appearance?: ReactNode;
}

export default function ConfigurationSections({ mode, analysis, appearance }: Props) {
    const analysisHost = document.getElementById("inspector-analysis");
    const appearanceHost = document.getElementById("inspector-appearance");
    if (analysisHost && appearanceHost) return <>
        {analysis ? createPortal(analysis, analysisHost) : null}
        {appearance ? createPortal(appearance, appearanceHost) : null}
    </>;
    return <div className="configuration-sections">
        {mode !== "appearance" && analysis ? <section className="configuration-section" aria-label="Analysis settings">{mode === "both" ? <h4><span className="codicon codicon-beaker" /> Analysis</h4> : null}{analysis}</section> : null}
        {mode !== "analysis" && appearance ? <section className="configuration-section" aria-label="Appearance settings">{mode === "both" ? <h4><span className="codicon codicon-paintcan" /> Appearance</h4> : null}{appearance}</section> : null}
    </div>;
}
