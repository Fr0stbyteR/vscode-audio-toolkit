import { FunctionComponent, useCallback } from "react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Marker from "./Marker";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import ModuleUsingMarker from "../../components/ModuleUsingMarker";

const MarkerComponent: FunctionComponent<VisualizationOptions<Marker>> = (props) => {
    const { module, moduleState, viewRange, gridColor, configuration } = props;
    const paintVerticalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [module, viewRange, configuration, gridColor]);
    const markerClassName = moduleState.name;
    const markerData = moduleState.data;
    return (
        <ModuleUsingMarker {...{ markerClassName, markerData, paintVerticalRuler, ...props }} />
    );
};

export default MarkerComponent;
