import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { FunctionComponent, useId } from "react";
import { useLocale } from "../i18n/LocaleContext";

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
    const { t } = useLocale();
    const instanceId = useId();
    const moduleStateKeys = keys ?? Object.keys(moduleState);
    const wrapped = moduleStateKeys.map((k) => {
        if (!optionsMetadata[k]) return;
        const [description, ...range] = optionsMetadata[k];
        const value = moduleState[k];
        const id = `${instanceId}-${moduleId.replace(/[^a-z0-9_-]/gi, "-")}-${k}`;
        if (typeof value === "boolean") {
            return (
                <div key={id}>
                    <VSCodeCheckbox checked={value} onChange={e => setModuleState({ ...moduleState, [k]: (e.currentTarget as HTMLInputElement).checked })}>{t(description)}</VSCodeCheckbox>
                </div>
            );
        } else if (typeof value === "number") {
            const [min, step, max] = range;
            return (
                <div key={id}>
                    <label htmlFor={id}>{t(description)}</label>
                    <input type="number" {...{ id, min, step, max, value }} onChange={e => {
                        const nextValue = e.currentTarget.valueAsNumber;
                        if (Number.isFinite(nextValue)) setModuleState({ ...moduleState, [k]: nextValue });
                    }} />
                </div>
            );
        } else if (typeof value === "string") {
            if (value.startsWith("#")) {
                return (
                    <div key={id}>
                        <label htmlFor={id}>{t(description)}</label>
                        <input {...{ id, value }} type="color" onChange={e => setModuleState({ ...moduleState, [k]: e.currentTarget.value })} />
                    </div>
                );
            }
            if (range?.length) {
                return (
                    <div key={id}>
                        <label htmlFor={id}>{t(description)}</label>
                        <VSCodeDropdown {...{ id, value, title: value }} onInput={e => setModuleState({ ...moduleState, [k]: (e.currentTarget as HTMLInputElement).value })}>
                            {range.map((v, i) => <VSCodeOption key={i} value={v}>{typeof v === "string" ? t(v) : v}</VSCodeOption>)}
                        </VSCodeDropdown>
                    </div>
                );
            }
            return (
                <div key={id}>
                    <label htmlFor={id}>{t(description)}</label>
                    <VSCodeTextField {...{ id, value }} onInput={e => setModuleState({ ...moduleState, [k]: (e.currentTarget as HTMLInputElement).value })} />
                </div>
            );
        }
    });
    if (wrap === false) return wrapped;
    return <div className={`default-layout ${moduleId.replace(".", "-")}-configuration`}>{wrapped}</div>;
};

export default ModuleConfigurationContent;
