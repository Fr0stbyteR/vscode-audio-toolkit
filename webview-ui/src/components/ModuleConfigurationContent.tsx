import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useId } from "react";

export interface ConfigurationContentProps {
    moduleId: string;
    moduleState: Record<string, any>;
    /** a subset of keys of `moduleState` that needs to render */
    keys?: string[],
    /** descriptions, then (min, step, max) or enums */
    optionsMetadata: Record<string, [string, ...any[]]>;
    setModuleState: (state: any) => any;
    wrap?: boolean;
}

const ModuleConfigurationContent: FunctionComponent<ConfigurationContentProps> = ({ moduleId, moduleState, keys, optionsMetadata, setModuleState, wrap }) => {
    const moduleStateKeys = keys ?? Object.keys(moduleState);
    const wrapped = moduleStateKeys.map((k) => {
        if (!optionsMetadata[k]) return;
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
    });
    if (wrap === false) return wrapped;
    return <div className={`default-layout ${moduleId.replace(".", "-")}-configuration`}>{wrapped}</div>;
};

export default ModuleConfigurationContent;
