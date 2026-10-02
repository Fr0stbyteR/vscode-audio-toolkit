// Development-only integration fixture: synthetic audio and results, no backend.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/theme.css";
import "../../src/standalone/standalone.css";
import "@vscode/codicons/dist/codicon.css";
import AudioEditor from "../../src/core/AudioEditor";
import AudioEditorContainer from "../../src/components/AudioEditorContainer";
import { AudioEditorContext } from "../../src/components/contexts";
import { LocaleProvider } from "../../src/i18n/LocaleContext";
import getLibrosaModules from "../../src/modules/librosa";
import getWaveformModules from "../../src/modules/waveform";
import BrowserAnalysisStore from "../../src/standalone/BrowserAnalysisStore";
import type { AudioAnalysisResult } from "../../src/types";

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
async function prepare() {
    // A separate dev-server origin is recommended; only fixture keys are touched.
    const store = new BrowserAnalysisStore("cache-ui-fixture"), other = new BrowserAnalysisStore("cache-ui-other");
    const modules = [...await getWaveformModules(), ...await getLibrosaModules()];
    modules.forEach(Module => { AudioEditor.MODULES_MAP[Module.MODULE_ID] = Module; });
    const requests = ["rms", "mfcc", "beats"].map(algorithm => {
        const Module = modules.find(Module => Module.getAnalysisRequest?.().algorithm === algorithm)!;
        return Module.getAnalysisRequest!();
    });
    requests[0].options!.hopLength = 256;
    const results: AudioAnalysisResult[] = [
        { algorithm: "rms", vectors: [Array.from({ length: 173 }, (_, n) => .15 + .05 * Math.sin(n / 10))], sampleRate: 44100, duration: 1, metadata: { hopLength: 256 } },
        { algorithm: "mfcc", matrix: Array.from({ length: 87 }, (_, n) => Array.from({ length: 20 }, (_, bin) => bin === 0 && n === 0 ? -40 : -20 + 20 * Math.sin(n / 10 + bin))), sampleRate: 44100, duration: 1, metadata: { hopLength: 512, minValue: -40, maxValue: 20 } },
        { algorithm: "beats", values: [.1, .4, .7], sampleRate: 44100, duration: 1, metadata: { tempo: 120 } }
    ];
    await Promise.all(requests.map((request, index) => store.save(request, results[index])));
    await other.save(requests[0], results[0]);
    results[1].matrix = undefined; // Same release performed by real matrix modules.
    check((await store.load(requests[1]))?.matrix?.[0][0] === -40, "IDB must clone matrices before release");
    check(await store.load({ ...requests[0], cachePolicy: "refresh" }) === undefined, "Refresh must bypass IDB");
    check((await store.list()).length === 3, "Small cache index must contain three results");
    const resetStore = new BrowserAnalysisStore("cache-ui-reset");
    await resetStore.save(requests[0], results[0]);
    const queued = resetStore.save(requests[1], { ...results[1], matrix: [[1]] });
    await resetStore.resetLocal(); await queued;
    await resetStore.save(requests[0], results[0]);
    check((await new BrowserAnalysisStore("cache-ui-reset").list()).length === 0, "Reset must suppress late writes");
    check((await other.list()).length === 1, "Reset must retain other audio");
    // PCM WAV generated entirely in memory.
    const pcm = new ArrayBuffer(44 + 44100 * 2), view = new DataView(pcm);
    const text = (at: number, value: string) => [...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, pcm.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 44100, true); view.setUint32(28, 88200, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, pcm.byteLength - 44, true);
    for (let n = 0; n < 44100; n++) view.setInt16(44 + n * 2, Math.sin(n * 440 * 2 * Math.PI / 44100) * 12000, true);
    let reads = 0;
    const editor = await AudioEditor.fromData(pcm, new AudioContext(), {}, [
        { moduleId: "waveform", state: {} }, { moduleId: "waveform", state: {} }
    ], "cache-ui", undefined, async request => {
        reads++;
        const result = await store.load(request);
        if (!result) throw new Error("Fixture forbids backend calculation");
        return result;
    });
    editor.setCachedAnalyses(await store.list());
    editor.on("modulesState", () => { document.getElementById("fixture-status")!.textContent = `IDB checks passed · local cache reads: ${reads}`; });
    createRoot(document.getElementById("root")!).render(<LocaleProvider>
        <p id="fixture-status">IDB checks passed · local cache reads: {reads}</p>
        <div className="web-editor" style={{ height: "calc(100vh - 60px)", display: "flex" }}><AudioEditorContext.Provider value={editor}><AudioEditorContainer standalone /></AudioEditorContext.Provider></div>
    </LocaleProvider>);
}
prepare().catch(reason => { document.getElementById("root")!.textContent = `Fixture failed: ${reason.message}`; });
