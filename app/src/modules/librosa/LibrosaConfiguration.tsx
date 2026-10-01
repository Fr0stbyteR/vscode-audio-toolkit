import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { useEffect, useState } from "react";
import ModuleConfigurationContent from "../../components/ModuleConfigurationContent";
import ConfigurationSections from "../../components/ConfigurationSections";
import LibrosaAnalysisModule, { LibrosaVisualizationState } from "./LibrosaAnalysisModule";
import { useLocale } from "../../i18n/LocaleContext";

export default function LibrosaConfiguration<State extends LibrosaVisualizationState>({ module, moduleState, mode }: { module: LibrosaAnalysisModule<State>; moduleState: State; mode: "analysis" | "appearance" | "both" }) {
    const { t } = useLocale();
    const [draft, setDraft] = useState(module.getAnalysisState(moduleState));
    useEffect(() => setDraft(module.getAnalysisState(moduleState)), [module, moduleState]);
    const analysisKeys = Object.keys(draft);
    const displayKeys = Object.keys(moduleState).filter(key => !analysisKeys.includes(key) && !["overlayOpacity", "referenceOverlay", "referenceOpacity"].includes(key));
    const metadata = module.getOptionsMetadata();
    return <div className="default-layout librosa-analysis-configuration">
        <ConfigurationSections mode={mode} analysis={<>
            <ModuleConfigurationContent moduleId={module.moduleId} moduleState={draft} setModuleState={setDraft} optionsMetadata={metadata} wrap={false} />
            <div className="analysis-actions">
                <VSCodeButton appearance="primary" title={t("Reanalyze")} onClick={() => {
                    const changed = analysisKeys.some(key => draft[key] !== module.getAnalysisState(moduleState)[key]);
                    module.setState({ ...moduleState, ...draft }, !changed);
                }}>{t("Reanalyze")}</VSCodeButton>
            </div>
        </>} appearance={<ModuleConfigurationContent moduleId={module.moduleId} moduleState={moduleState} keys={displayKeys} setModuleState={state => module.setState(state)} optionsMetadata={metadata} wrap={false} />} />
    </div>;
}
