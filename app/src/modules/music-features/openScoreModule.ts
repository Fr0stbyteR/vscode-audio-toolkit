import type AudioEditor from "../../core/AudioEditor";

/** Navigate to the existing score, or create an empty importable score module. */
export async function openScoreModule(editor: AudioEditor) {
    let index = editor.modulesInstance.findIndex(module => module.moduleId === "score.musicxml");
    if (index < 1) {
        await editor.addModule("score.musicxml");
        index = editor.modulesInstance.findIndex(module => module.moduleId === "score.musicxml");
    }
    editor.focusModule(index);
}
