import "./WaveformComponent.scss";
import { FunctionComponent, useCallback, useContext, useState } from "react";
import { AudioEditorContext } from "../../components/contexts";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { setCanvasToFullSize } from "../../utils";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import Waveform from "./Waveform";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import ModuleUsingCanvas from "../../components/ModuleUsingCanvas";

const WaveformComponent: FunctionComponent<VisualizationOptions<Waveform>> = (props) => {
    const { module, viewRange, enabledChannels, phosphorColor, gridColor, gridRulerColor, textColor, monospaceFont, configuration } = props;
    const audioEditor = useContext(AudioEditorContext)!;
    const defaultVerticalOffset = 0;
    const defaultVerticalZoom = 1;
    const showChannelEnableOverlay = true;
    const [verticalZoom, setVerticalZoom] = useState(defaultVerticalZoom);
    const [verticalOffset, setVerticalOffset] = useState(defaultVerticalOffset);
    const paint = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paint(ctx, module.dataSlices, { width, height, verticalZoom, verticalOffset }, { viewRange }, { phosphorColor });
    }, [module, verticalZoom, verticalOffset, viewRange, phosphorColor]);
    const paintVerticalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [module, viewRange, configuration, gridColor]);
    const paintHorizontalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintHorizontalRuler(ctx, module.audioEditor.numberOfChannels, { width, height, verticalZoom, verticalOffset, labelMode: "decibel", labelsWidth: 80 }, { gridColor, gridRulerColor, textColor, labelFont: monospaceFont });
    }, [module, verticalZoom, verticalOffset, gridColor, gridRulerColor, textColor, monospaceFont]);
    const configurationContent = (
        <div className="waveform-channel-enabler">
            {
                enabledChannels.map((enabled, i) => (
                    <div key={i}>
                        <VSCodeButton aria-label={`Enable / Disable Channel ${i + 1}`} title={`Enable / Disable Channel ${i + 1}`} tabIndex={-1} className={enabled ? "active" : ""} appearance="icon" onClick={() => audioEditor.setEnabledChannel(i, !enabledChannels[i])}>
                            <span>{i + 1}</span>
                        </VSCodeButton>
                    </div>
                ))
            }
        </div>
    );
    const moduleUsingCanvasProps = {
        defaultVerticalOffset, verticalOffset, setVerticalOffset,
        defaultVerticalZoom, verticalZoom, setVerticalZoom,
        paint, paintVerticalRuler, paintHorizontalRuler,
        showChannelEnableOverlay, configurationContent,
        ...props
    };
    return (
        <ModuleUsingCanvas {...moduleUsingCanvasProps} />
    );
};

export default WaveformComponent;
