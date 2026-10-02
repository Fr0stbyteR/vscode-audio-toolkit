import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

// Keep the real editor and its player callback entry points; replace browser
// audio resources so playback timing can be driven deterministically.
const bundle = await build({
    stdin: { contents: 'export { default as AudioEditor } from "./src/core/AudioEditor"; export * from "./src/core/PlaybackFollow";', resolveDir: process.cwd() },
    bundle: true, platform: "browser", format: "esm", write: false,
    alias: { "@shren/typed-event-emitter": "@shren/typed-event-emitter/dist/esm/index.js" },
    plugins: [{ name: "playback-browser-resources", setup(build) {
        build.onLoad({ filter: /AudioPlayer\.ts$/ }, () => ({ contents: `
            export default class Player {
                static async init(editor) { return new Player(editor); }
                constructor(editor) { this.editor = editor; this.starts = []; this.stops = 0; }
                play() { this.starts.push(this.editor.state.playhead); }
                stop() { this.stops++; }
                tick(sample) { this.editor.setPlayhead(sample, true); }
                ended(sample) { this.editor.handlePlayerEnded(sample); }
            }
        `, loader: "js" }));
        build.onLoad({ filter: /OperableAudioBuffer\.ts$/ }, () => ({ contents: "export default class Buffer {}", loader: "js" }));
        build.onLoad({ filter: /(?:Spectrogram|Waveform)\.ts$/ }, () => ({ contents: 'export default class Module { static MODULE_ID = "stub"; static DEFAULT_STATE = {}; }', loader: "js" }));
    } }]
});
const { AudioEditor, playbackFollowMode, playbackFollowRange } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

async function makeEditor(configuration = {}, length = 10000) {
    const editor = new AudioEditor(
        { duration: length / 1000, length, sampleRate: 1000, numberOfChannels: 1 },
        [], {}, { ...AudioEditor.DEFAULT_CONFIGURATION, ...configuration }, "test-audio", "workspace"
    );
    await editor.initPlayer();
    editor.setViewRange([0, 1000]);
    return editor;
}

function assertView(editor, expected, span = 1000) {
    assert.deepEqual(editor.state.viewRange, expected);
    assert.equal(editor.state.viewRange[1] - editor.state.viewRange[0], span, "following preserves the zoom span");
    assert.ok(editor.state.viewRange.every(Number.isInteger), "sample ranges remain integer-valued");
    assert.ok(editor.state.viewRange[0] >= 0 && editor.state.viewRange[1] <= editor.length);
}

test("page is the default and unknown persisted choices safely use it", () => {
    assert.equal(AudioEditor.DEFAULT_CONFIGURATION.playbackFollow, "page");
    assert.equal(playbackFollowMode("scroll"), "scroll");
    for (const value of [undefined, null, "page", "legacy", 0, {}]) assert.equal(playbackFollowMode(value), "page");
});

test("page keeps the viewport steady until the last two percent, then leaves context", () => {
    const range = [1000, 2000];
    assert.equal(playbackFollowRange(range, 1000, 10000, "page"), undefined);
    assert.equal(playbackFollowRange(range, 1979, 10000, "page"), undefined);
    assert.deepEqual(playbackFollowRange(range, 1980, 10000, "page"), [1900, 2900]);
    assert.equal(playbackFollowRange([100, 110], 108, 1000, "page"), undefined);
    assert.deepEqual(playbackFollowRange([100, 110], 109, 1000, "page"), [108, 118], "short views flip at least one sample before the edge");
    assert.deepEqual(range, [1000, 2000], "the caller's range is not mutated");
});

test("scroll puts the playhead at 35 percent and clamps to the audio boundaries", () => {
    assert.deepEqual(playbackFollowRange([1000, 2000], 1500, 10000, "scroll"), [1150, 2150]);
    assert.equal(playbackFollowRange([1150, 2150], 1500, 10000, "scroll"), undefined, "an already anchored view emits no change");
    assert.deepEqual(playbackFollowRange([1000, 2000], -50, 10000, "scroll"), [0, 1000]);
    assert.deepEqual(playbackFollowRange([1000, 2000], 20000, 10000, "scroll"), [9000, 10000]);
});

test("invalid or full-span viewports safely stay stationary", () => {
    for (const [range, cursor, length] of [
        [[0, 0], 0, 1000], [[200, 100], 250, 1000], [[-1, 100], 250, 1000],
        [[0, 1001], 250, 1000], [[NaN, 100], 250, 1000], [[0, Infinity], 250, 1000],
        [[0, 100], NaN, 1000], [[0, 100], 250, Infinity], [[0, 100], 250, 0],
        [[0, 1000], 250, 1000], [[0, 1000], 1000, 1000]
    ]) {
        for (const mode of ["page", "scroll"]) assert.equal(playbackFollowRange(range, cursor, length, mode), undefined);
    }
});

test("player updates flip successive pages and recover from skipped frames, seeks and loops", async () => {
    const editor = await makeEditor();
    const views = [];
    editor.on("viewRange", range => views.push([...range]));
    editor.play();
    editor.player.tick(979);
    assertView(editor, [0, 1000]);
    assert.equal(views.length, 0, "ordinary progression does not repaint the viewport");
    editor.player.tick(980);
    assertView(editor, [900, 1900]);
    editor.player.tick(1500);
    assert.equal(views.length, 1);
    editor.player.tick(1880);
    assertView(editor, [1800, 2800]);
    editor.player.tick(6600); // A delayed animation frame can skip several pages.
    assertView(editor, [6520, 7520]);
    editor.player.tick(1200); // Backwards seek, without waiting for an edge.
    assertView(editor, [1120, 2120]);
    editor.player.tick(9500);
    assertView(editor, [9000, 10000]);
    editor.player.tick(200); // A whole-audio loop crosses from the end to the start.
    assertView(editor, [120, 1120]);
    editor.player.tick(0);
    assertView(editor, [0, 1000]);
    assert.equal(editor.state.playing, "playing");
});

test("following preserves a newly zoomed viewport through selection loop boundaries", async () => {
    const editor = await makeEditor();
    editor.setState({ selRange: [4000, 7000], playhead: 4000 });
    editor.setViewRange([4500, 4750]);
    editor.play();
    assertView(editor, [3980, 4230], 250);
    editor.player.tick(6900);
    assertView(editor, [6880, 7130], 250);
    editor.player.tick(4000);
    assertView(editor, [3980, 4230], 250);
});

test("paused and stopped player callbacks, manual cursors and preference changes do not follow", async () => {
    const editor = await makeEditor();
    for (const playing of ["stopped", "paused"]) {
        editor.setState({ playing });
        editor.setViewRange([1000, 2000]);
        editor.setPlayhead(8000);
        assertView(editor, [1000, 2000]);
        editor.player.tick(9000);
        assertView(editor, [1000, 2000]);
        editor.setConfiguration({ playbackFollow: "scroll" });
        assertView(editor, [1000, 2000]);
        assert.equal(editor.state.playing, playing);
    }
    assert.equal(editor.player.starts.length, 0);
});

test("starting and resuming follow an offscreen current cursor immediately", async () => {
    const editor = await makeEditor();
    editor.setPlayhead(5000);
    editor.play();
    assertView(editor, [4920, 5920]);
    assert.equal(editor.player.starts.at(-1), 5000);
    editor.pause();
    editor.setViewRange([0, 1000]);
    editor.setPlayhead(7000);
    assertView(editor, [0, 1000]);
    editor.resume();
    assertView(editor, [6920, 7920]);
    assert.equal(editor.player.starts.at(-1), 7000);
});

test("starting and resuming a selection follow the actual playback start", async () => {
    const editor = await makeEditor();
    editor.setState({ selRange: [3000, 6000], playhead: 5500 });
    editor.play();
    assert.equal(editor.state.playhead, 3000);
    assertView(editor, [2920, 3920]);
    editor.player.tick(5500);
    editor.pause();
    editor.setViewRange([7000, 8000]);
    editor.resume();
    assert.equal(editor.state.playhead, 3000);
    assertView(editor, [2920, 3920]);
    assert.deepEqual(editor.player.starts, [3000, 3000]);
});

test("a manual seek during playback immediately follows the restarted player", async () => {
    const editor = await makeEditor();
    editor.play();
    editor.setPlayhead(6500);
    assert.equal(editor.player.stops, 1);
    assert.equal(editor.player.starts.at(-1), 6500);
    assertView(editor, [6420, 7420]);
    assert.equal(editor.state.playing, "playing");
});

test("switching follow modes while playing updates immediately and scroll stays anchored", async () => {
    const editor = await makeEditor();
    editor.play();
    editor.player.tick(500);
    assertView(editor, [0, 1000]);
    editor.setConfiguration({ playbackFollow: "scroll" });
    assertView(editor, [150, 1150]);
    editor.player.tick(550);
    assertView(editor, [200, 1200]);
    editor.setViewRange([7000, 8000]);
    editor.setConfiguration({ playbackFollow: "page" });
    assertView(editor, [470, 1470]);
    editor.player.tick(900);
    assertView(editor, [470, 1470], 1000);
});

test("an ended callback follows the final sample before publishing stopped state", async () => {
    const editor = await makeEditor();
    const events = [];
    editor.play();
    editor.on("viewRange", () => events.push(["view", editor.state.playing]));
    editor.on("playing", playing => events.push(["playing", playing]));
    editor.player.ended(10000);
    assert.equal(editor.state.playhead, 10000);
    assertView(editor, [9000, 10000]);
    assert.equal(editor.state.playing, "stopped");
    assert.deepEqual(events, [["view", "playing"], ["playing", "stopped"]]);
});

test("full-audio views stay stationary in either mode, including the final callback", async () => {
    for (const mode of ["page", "scroll"]) {
        const editor = await makeEditor({ playbackFollow: mode });
        editor.setViewRangeToAll();
        let viewChanges = 0;
        editor.on("viewRange", () => { viewChanges++; });
        editor.play();
        for (const sample of [100, 5000, 9999, 0]) editor.player.tick(sample);
        editor.player.ended(10000);
        assertView(editor, [0, 10000], 10000);
        assert.equal(viewChanges, 0);
    }
});
