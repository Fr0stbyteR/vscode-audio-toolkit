import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import ModuleUsingMarker from "../../components/ModuleUsingMarker";
import ModuleConfigurationContent from "../../components/ModuleConfigurationContent";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import { setCanvasToFullSize } from "../../utils";
import LibrosaMarkerModule from "./LibrosaMarkerModule";

const LibrosaMarkerComponent: FunctionComponent<VisualizationOptions<LibrosaMarkerModule>> = props => {
    const { module, moduleState, viewRange, gridColor, configuration } = props;
    const [draft, setDraft] = useState(module.getAnalysisState(moduleState));
    const [calculating, setCalculating] = useState<boolean | [number, string]>(module.isCalculating);
    useEffect(() => {
        module.onCalculating = setCalculating;
        return () => { module.onCalculating = undefined; };
    }, [module]);
    const paintVerticalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [configuration, gridColor, module, viewRange]);
    const analysisKeys = Object.keys(draft);
    const displayKeys = Object.keys(moduleState).filter(key => !["data", "name", ...analysisKeys].includes(key));
    const configurationContentChildren = <>
        <ModuleConfigurationContent moduleId={module.moduleId} moduleState={draft} setModuleState={setDraft} optionsMetadata={module.getOptionsMetadata()} wrap={false} />
        <div className="analysis-actions">
            <VSCodeButton appearance="primary" onClick={() => module.setState({ ...moduleState, ...draft })}>Analyze</VSCodeButton>
            <span>{moduleState.data?.length ?? 0} markers</span>
        </div>
        <VSCodeDivider />
        <ModuleConfigurationContent moduleId={module.moduleId} moduleState={moduleState} keys={displayKeys} setModuleState={state => module.setState(state)} optionsMetadata={module.getOptionsMetadata()} wrap={false} />
    </>;
    return <ModuleUsingMarker {...props} calculating={calculating} markerClassName={moduleState.name} markerData={moduleState.data ?? []} paintVerticalRuler={paintVerticalRuler} configurationContentChildren={configurationContentChildren} />;
};

export default LibrosaMarkerComponent;
