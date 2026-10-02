import "@vscode/codicons/dist/codicon.css";
import { createRoot } from "react-dom/client";
import AudioEditor from "../src/core/AudioEditor";
import AudioEditorContainer from "../src/components/AudioEditorContainer";
import { AudioEditorContext } from "../src/components/contexts";
import { LocaleProvider } from "../src/i18n/LocaleContext";
import getWaveformModules from "../src/modules/waveform";
import getEssentiaModules from "../src/modules/essentia";
import MusicAnalysisClient from "../src/standalone/MusicAnalysisClient";
import "../src/theme.css";
import "../src/standalone/standalone.css";

function makeWav(): ArrayBuffer {
    const rate = 44100, length = rate * 3;
    const data = new ArrayBuffer(44 + length * 2), view = new DataView(data);
    const string = (offset: number, value: string) => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    string(0, "RIFF"); view.setUint32(4, data.byteLength - 8, true); string(8, "WAVE"); string(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); string(36, "data"); view.setUint32(40, length * 2, true);
    for (let index = 0; index < length; index++) {
        const sample = index >= rate && index < 2 * rate ? 0 : .2 * Math.sin(2 * Math.PI * 440 * index / rate);
        view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
    }
    return data;
}

async function run() {
    const Modules = (await Promise.all([getWaveformModules(), getEssentiaModules()])).flat();
    Modules.forEach(Module => AudioEditor.MODULES_MAP[Module.MODULE_ID] = Module);
    const wav = makeWav(), file = new File([wav], "synthetic-tone.wav", { type: "audio/wav" });
    // Test-only local service: never shares the user's real library or credentials.
    const client = new MusicAnalysisClient({ baseUrl: "http://127.0.0.1:49322", token: "essentia-ui-test" });
    const matrixRenderer = new URLSearchParams(location.search).has("webgl") ? "webgl" : "canvas2d";
    const editor = await AudioEditor.fromData(wav, new AudioContext(), { matrixRenderer }, AudioEditor.DEFAULT_MODULES_STATE.slice(0, 1), "native-synthetic-test", location.href, request => client.analyze(file, request));
    await editor.addModule("essentia.rms");
    await editor.addModule("essentia.hpcp");
    await editor.addModule("essentia.silenceRegions");
    document.getElementById("native-test-root")!.innerHTML = '<div class="standalone-shell"><aside class="workspace-sidebar"><div id="standalone-layers-host"></div></aside><main class="web-editor"><div id="editor-root"></div></main></div>';
    createRoot(document.getElementById("editor-root")!).render(<LocaleProvider><AudioEditorContext.Provider value={editor}><AudioEditorContainer standalone /></AudioEditorContext.Provider></LocaleProvider>);
}
run().catch(error => { document.getElementById("native-test-root")!.textContent = String(error); });
