import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Module from "./BeatTrackerDegara";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import ModuleUsingMarker from "../../components/ModuleUsingMarker";
import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import ModuleConfigurationContent from "../../components/ModuleConfigurationContent";

const Component: FunctionComponent<VisualizationOptions<Module>> = (props) => {
    const { module, moduleState, viewRange, gridColor, configuration } = props;
    const [essentiaState, setEssentiaState] = useState(module.getEssentiaState(moduleState));
    const [calculating, setCalculating] = useState<boolean | [number, string]>(module.isCalculating);
    const handleCalculating = useCallback((calculating: boolean | [number, string]) => setCalculating(calculating), []);
    useEffect(() => {
        module.onCalculating = handleCalculating;
        return () => module.onCalculating = undefined;
    }, [handleCalculating, module]);
    const paintVerticalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [module, viewRange, configuration, gridColor]);
    const setModuleState = useCallback((state: typeof module.state) => module.setState(state), [module]);
    const optionsMetadata = module.getOptionsMetadata();
    const essentiaStateKeys = Object.keys(essentiaState);
    const moduleStateKeys = Object.keys(moduleState).filter(k => k !== "data" && k !== "name" && essentiaStateKeys.indexOf(k) === -1);
    const configurationContentChildren = (<>
        <ModuleConfigurationContent moduleId={module.moduleId} moduleState={essentiaState} setModuleState={setEssentiaState} optionsMetadata={optionsMetadata} wrap={false} />
        <div>
            <VSCodeButton tabIndex={-1} title="Submit for Calculate" appearance="primary" onClick={() => setModuleState({ ...moduleState, ...essentiaState })}>Calculate</VSCodeButton>
        </div>
        <VSCodeDivider />
        <ModuleConfigurationContent moduleId={module.moduleId} moduleState={moduleState} keys={moduleStateKeys} setModuleState={setModuleState} optionsMetadata={optionsMetadata} wrap={false} />
    </>);
    const markerClassName = moduleState.name;
    const markerData = moduleState.data ?? [];
    return (
        <ModuleUsingMarker {...{ calculating, markerClassName, markerData, paintVerticalRuler, configurationContentChildren, ...props }} />
    );
};

export default Component;
