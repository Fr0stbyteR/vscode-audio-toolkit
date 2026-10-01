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

function wav(): ArrayBuffer {
    const rate = 16000, length = rate * 16;
    const data = new ArrayBuffer(44 + length * 2), view = new DataView(data);
    const string = (offset: number, value: string) => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    string(0, "RIFF"); view.setUint32(4, data.byteLength - 8, true); string(8, "WAVE"); string(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); string(36, "data"); view.setUint32(40, length * 2, true);
    for (let index = 0; index < length; index++) {
        const time = index / rate, beat = Math.exp(-18 * (time % .5));
        const sample = .15 * beat * (Math.sin(2 * Math.PI * (time < 8 ? 440 : 659.25) * time) + .5 * Math.sin(2 * Math.PI * 880 * time));
        view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
    }
    return data;
}
async function run() {
    const modules = (await Promise.all([getWaveformModules(), getEssentiaModules()])).flat();
    modules.forEach(Module => AudioEditor.MODULES_MAP[Module.MODULE_ID] = Module);
    const data = wav(), file = new File([data], "synthetic-pulsed-test.wav", { type: "audio/wav" });
    const client = new MusicAnalysisClient({ baseUrl: "http://127.0.0.1:49327", token: "tf-browser-test" });
    const matrixRenderer = new URLSearchParams(location.search).has("canvas2d") ? "canvas2d" : "webgl";
    const editor = await AudioEditor.fromData(data, new AudioContext(), { matrixRenderer }, AudioEditor.DEFAULT_MODULES_STATE.slice(0, 1), "tf-browser-synthetic", location.href, request => client.analyze(file, request));
    await editor.addModule("essentia.tfInstrument");
    await editor.addModule("essentia.tfInstrumentCurve");
    await editor.addModule("essentia.tfInstrumentRegions");
    await editor.addModule("essentia.tfTempo");
    document.getElementById("tf-test-root")!.innerHTML = '<div class="standalone-shell"><aside class="workspace-sidebar"><div id="standalone-layers-host"></div></aside><main class="web-editor"><div id="editor-root"></div></main></div>';
    createRoot(document.getElementById("editor-root")!).render(<LocaleProvider><AudioEditorContext.Provider value={editor}><AudioEditorContainer standalone /></AudioEditorContext.Provider></LocaleProvider>);
}
run().catch(error => { document.getElementById("tf-test-root")!.textContent = String(error); });
