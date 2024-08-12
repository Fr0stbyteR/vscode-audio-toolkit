import { VSCodeButton, VSCodeCheckbox, VSCodeDivider, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useId } from "react";

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
        {essentiaStateKeys.map((k) => {
            const [description, ...range] = optionsMetadata[k];
            const value = essentiaState[k];
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const id = useId();
            if (typeof value === "boolean") {
                return (
                    <div key={id}>
                        <VSCodeCheckbox checked={value} onChange={e => setEssentiaState({ ...essentiaState, [k]: (e.currentTarget as HTMLInputElement).checked })}>{description}</VSCodeCheckbox>
                    </div>
                );
            } else if (typeof value === "number") {
                const [min, step, max] = range;
                return (
                    <div key={id}>
                        <label htmlFor={id}>{description}</label>
                        <input type="number" {...{ id, min, step, max, value }} onChange={e => setEssentiaState({ ...essentiaState, [k]: e.currentTarget.valueAsNumber })} />
                    </div>
                );
            } else if (typeof value === "string") {
                if (value.startsWith("#")) {
                    return (
                        <div>
                            <label htmlFor={id}>{description}</label>
                            <input {...{ id, value }} type="color" onChange={e => setEssentiaState({ ...essentiaState, [k]: e.currentTarget.value })} />
                        </div>
                    );
                }
                if (range?.length) {
                    return (
                        <div>
                            <label htmlFor={id}>{description}</label>
                            <VSCodeDropdown {...{ id, value, title: value }} onInput={e => setEssentiaState({ ...essentiaState, [k]: (e.currentTarget as HTMLInputElement).value })}>
                                {range.map((v, i) => <VSCodeOption key={i} value={v}>{v}</VSCodeOption>)}
                            </VSCodeDropdown>
                        </div>
                    );
                }
                return (
                    <div>
                        <label htmlFor={id}>{description}</label>
                        <VSCodeTextField {...{ id, value }} onInput={e => setEssentiaState({ ...essentiaState, [k]: (e.currentTarget as HTMLInputElement).value })} />
                    </div>
                );
            }
        })}
        <div>
            <VSCodeButton tabIndex={-1} title="Submit for Calculate" appearance="primary" onClick={() => setModuleState({ ...moduleState, ...essentiaState })}>Calculate</VSCodeButton>
        </div>
        <VSCodeDivider />
        {moduleStateKeys.map((k) => {
            const [description, ...range] = optionsMetadata[k];
            const value = moduleState[k];
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const id = useId();
            if (typeof value === "boolean") {
                return (
                    <div key={id}>
                        <VSCodeCheckbox checked={value} onChange={e => setModuleState({ ...moduleState, [k]: (e.currentTarget as HTMLInputElement).checked })}>{description}</VSCodeCheckbox>
                    </div>
                );
            } else if (typeof value === "number") {
                const [min, step, max] = range;
                return (
                    <div key={id}>
                        <label htmlFor={id}>{description}</label>
                        <input type="number" {...{ id, min, step, max, value }} onChange={e => setModuleState({ ...moduleState, [k]: e.currentTarget.valueAsNumber })} />
                    </div>
                );
            } else if (typeof value === "string") {
                if (value.startsWith("#")) {
                    return (
                        <div>
                            <label htmlFor={id}>{description}</label>
                            <input {...{ id, value }} type="color" onChange={e => setModuleState({ ...moduleState, [k]: e.currentTarget.value })} />
                        </div>
                    );
                }
                if (range?.length) {
                    return (
                        <div>
                            <label htmlFor={id}>{description}</label>
                            <VSCodeDropdown {...{ id, value, title: value }} onInput={e => setModuleState({ ...moduleState, [k]: (e.currentTarget as HTMLInputElement).value })}>
                                {range.map((v, i) => <VSCodeOption key={i} value={v}>{v}</VSCodeOption>)}
                            </VSCodeDropdown>
                        </div>
                    );
                }
                return (
                    <div>
                        <label htmlFor={id}>{description}</label>
                        <VSCodeTextField {...{ id, value }} onInput={e => setModuleState({ ...moduleState, [k]: (e.currentTarget as HTMLInputElement).value })} />
                    </div>
                );
            }
        })}
    </div>);
};

export default ConfigurationContent;
