import "@vscode/codicons/dist/codicon.css";
import { createRoot } from "react-dom/client";
import AudioEditor from "../src/core/AudioEditor";
import AudioEditorContainer from "../src/components/AudioEditorContainer";
import { AudioEditorContext } from "../src/components/contexts";
import { LocaleProvider } from "../src/i18n/LocaleContext";
import getWaveformModules from "../src/modules/waveform";
import getSpectrogramModules from "../src/modules/spectrogram";
import getScoreModules from "../src/modules/score";
import { importScore, loadScore, type ScoreNote } from "../src/modules/score/ScoreLibrary";
import { DEFAULT_SCORE_STATE } from "../src/modules/score/ScoreModule";
import "../src/theme.css";
import "../src/standalone/standalone.css";

function makeWav(notes: ScoreNote[], duration: number): ArrayBuffer {
    const rate = 22050, length = Math.ceil(duration * rate);
    const data = new ArrayBuffer(44 + length * 2), view = new DataView(data);
    const string = (offset: number, value: string) => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    string(0, "RIFF"); view.setUint32(4, data.byteLength - 8, true); string(8, "WAVE"); string(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); string(36, "data"); view.setUint32(40, length * 2, true);
    for (let index = 0; index < length; index++) {
        const time = index / rate;
        let sample = 0;
        for (const note of notes) if (time >= note.time && time < note.time + note.duration) sample += 0.22 * Math.sin(2 * Math.PI * 440 * 2 ** ((note.pitch - 69) / 12) * time);
        view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
    }
    return data;
}

async function run() {
    const response = await fetch("./fixtures/two-measures.musicxml");
    const imported = await importScore(new File([await response.arrayBuffer()], "two-measures.musicxml"));
    const score = await loadScore(imported.key);
    const groups = await Promise.all([getWaveformModules(), getSpectrogramModules(), getScoreModules()]);
    groups.flat().forEach(Module => AudioEditor.MODULES_MAP[Module.MODULE_ID] = Module);
    const context = new AudioContext();
    const editor = await AudioEditor.fromData(makeWav(score.notes, score.duration), context, {}, undefined, "score-test-audio");
    const state = { ...DEFAULT_SCORE_STATE, scoreKey: imported.key, fileName: imported.name, format: imported.format, alignmentAudioKey: "score-test-audio" };
    await editor.addModule("score.musicxml", state, "MusicXML score", true);
    await editor.addModule("score.pianoroll", state, "Piano roll", true);
    document.getElementById("score-test-root")!.innerHTML = '<div class="standalone-shell"><aside class="workspace-sidebar"><div id="standalone-layers-host"></div></aside><main class="web-editor"><div id="editor-root"></div></main></div>';
    createRoot(document.getElementById("editor-root")!).render(<LocaleProvider><AudioEditorContext.Provider value={editor}><AudioEditorContainer standalone /></AudioEditorContext.Provider></LocaleProvider>);
}

run().catch(error => { document.getElementById("score-test-root")!.textContent = String(error); });
