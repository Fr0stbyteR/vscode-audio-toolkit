import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import { useEffect, useState } from "react";
import ModuleConfigurationContent from "../../components/ModuleConfigurationContent";
import LibrosaAnalysisModule, { LibrosaVisualizationState } from "./LibrosaAnalysisModule";

export default function LibrosaConfiguration<State extends LibrosaVisualizationState>({ module, moduleState }: { module: LibrosaAnalysisModule<State>; moduleState: State }) {
    const [draft, setDraft] = useState(module.getAnalysisState(moduleState));
    useEffect(() => setDraft(module.getAnalysisState(moduleState)), [module, moduleState]);
    const analysisKeys = Object.keys(draft);
    const displayKeys = Object.keys(moduleState).filter(key => !analysisKeys.includes(key));
    const metadata = module.getOptionsMetadata();
    return <div className="default-layout librosa-analysis-configuration">
        <ModuleConfigurationContent moduleId={module.moduleId} moduleState={draft} setModuleState={setDraft} optionsMetadata={metadata} wrap={false} />
        <div className="analysis-actions">
            <VSCodeButton appearance="primary" onClick={() => module.setState({ ...moduleState, ...draft })}>Analyze</VSCodeButton>
        </div>
        <VSCodeDivider />
        <ModuleConfigurationContent moduleId={module.moduleId} moduleState={moduleState} keys={displayKeys} setModuleState={state => module.setState(state)} optionsMetadata={metadata} wrap={false} />
    </div>;
}
