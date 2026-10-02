import { Component, ErrorInfo, ReactNode } from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { useLocale } from "../i18n/LocaleContext";

interface Props {
    children: ReactNode;
    moduleName: string;
    onRemove: () => void;
}

interface State {
    error?: Error;
}

class ModuleErrorBoundaryImpl extends Component<Props & { t(key: string): string }, State> {
    state: State = {};

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(`Audio module ${this.props.moduleName} failed to render.`, error, info);
    }

    render() {
        if (!this.state.error) return this.props.children;
        const { t } = this.props;
        return <div className="editor-main-module-error" role="alert">
            <strong>{this.props.moduleName} {t("could not be displayed.")}</strong>
            <span>{this.state.error.message || t("Unknown rendering error")}</span>
            <VSCodeButton appearance="secondary" onClick={this.props.onRemove}>{t("Remove module")}</VSCodeButton>
        </div>;
    }
}

export default function ModuleErrorBoundary(props: Props) {
    const { t } = useLocale();
    return <ModuleErrorBoundaryImpl {...props} t={t} />;
}
