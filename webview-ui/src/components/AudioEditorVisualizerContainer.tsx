import { AudioEditorState, AudioEditorConfiguration } from "../core/AudioEditor";
import { AudioToolkitModule, VisualizationOptions } from "../core/AudioToolkitModule";

interface Props extends VisualizationOptions {
    Module: typeof AudioToolkitModule;
}

const AudioEditorVisualizerContainer = ({ Module, ...props}: Props) => {

    return (
        <div className="editor-visualizer-container">

        </div>
    );
};
