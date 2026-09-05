import { Component, ErrorInfo, ReactNode } from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

interface Props {
    children: ReactNode;
    moduleName: string;
    onRemove: () => void;
}

interface State {
    error?: Error;
}

export default class ModuleErrorBoundary extends Component<Props, State> {
    state: State = {};

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(`Audio module ${this.props.moduleName} failed to render.`, error, info);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return <div className="editor-main-module-error" role="alert">
            <strong>{this.props.moduleName} could not be displayed.</strong>
            <span>{this.state.error.message || "Unknown rendering error"}</span>
            <VSCodeButton appearance="secondary" onClick={this.props.onRemove}>Remove module</VSCodeButton>
        </div>;
    }
}
