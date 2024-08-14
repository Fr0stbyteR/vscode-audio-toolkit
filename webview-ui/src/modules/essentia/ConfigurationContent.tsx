import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent } from "react";
import ModuleConfigurationContent from "../../components/ModuleConfigurationContent";

export interface ConfigurationContentProps {
    moduleId: string;
    moduleState: Record<string, any>;
    essentiaState: Record<string, any>;
    optionsMetadata: Record<string, [string, ...any[]]>;
    setEssentiaState: React.Dispatch<React.SetStateAction<any>>;
    setModuleState: (state: any) => any;
}

const ConfigurationContent: FunctionComponent<ConfigurationContentProps> = ({ moduleId, moduleState, essentiaState, optionsMetadata, setModuleState, setEssentiaState }) => {
    const essentiaStateKeys = Object.keys(essentiaState);
    const moduleStateKeys = Object.keys(moduleState).filter(k => essentiaStateKeys.indexOf(k) === -1);
    return (<div className={`default-layout ${moduleId.replace(".", "-")}-configuration`}>
        <ModuleConfigurationContent moduleId={moduleId} moduleState={essentiaState} setModuleState={setEssentiaState} optionsMetadata={optionsMetadata} wrap={false} />
        <div>
            <VSCodeButton tabIndex={-1} title="Submit for Calculate" appearance="primary" onClick={() => setModuleState({ ...moduleState, ...essentiaState })}>Calculate</VSCodeButton>
        </div>
        <VSCodeDivider />
        <ModuleConfigurationContent moduleId={moduleId} moduleState={moduleState} keys={moduleStateKeys} setModuleState={setModuleState} optionsMetadata={optionsMetadata} wrap={false} />
    </div>);
};

export default ConfigurationContent;
