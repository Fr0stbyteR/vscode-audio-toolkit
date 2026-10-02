import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
async function bundle(path, stubUI = false) {
    const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, platform: "node", format: "esm", write: false,
        plugins: stubUI ? [{ name: "stub-component", setup(build) { build.onLoad({ filter: /ClapRelevanceCurveComponent\.tsx$/ }, () => ({ contents: "export default function Component() {}", loader: "js" })); } }] : [] });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const { readNdjson } = await bundle("../src/standalone/readNdjson.ts");
const { default: Client } = await bundle("../src/standalone/MusicAnalysisClient.ts");
const { default: Curve } = await bundle("../src/modules/semantic-description/ClapRelevanceCurve.ts", true);
const encoder = new TextEncoder();
const result = points => ({ assetId: "test", keyword: "piano", prompts: ["piano"], windowSeconds: 5, hopSeconds: 1, providerId: "mock", aggregation: "mean", points });
const point = timeSeconds => ({ timeSeconds, score: .6, cosineSimilarity: .2 });
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);

test("clearing one audio's frontend caches preserves other audio and never calls backend reset", async () => {
    const original = globalThis.fetch, requests = [];
    globalThis.fetch = async (url, options) => {
        requests.push(url);
        if (url.endsWith("interactive-assets")) return Response.json({ id: options.body.name });
        return Response.json({ descriptions: [], rawMatches: [] });
    };
    try {
        const client = new Client({ baseUrl: "http://localhost", token: "" });
        const a = new File(["a"], "a.wav"), b = new File(["b"], "b.wav");
        const request = { startSeconds: 0, endSeconds: 5, maximumResults: 10 };
        await client.describe(a, request); await client.describe(b, request);
        assert.equal((await client.describe(a, request)).cached, true);
        client.clearAudio(a);
        await client.describe(a, request);
        assert.equal((await client.describe(b, request)).cached, true);
        assert.equal(requests.filter(url => url.includes('a.wav:describe')).length, 2);
        assert.equal(requests.filter(url => url.includes('b.wav:describe')).length, 1);
        assert.ok(requests.every(url => !/reset|delete|invalidate/.test(url)));
    } finally { globalThis.fetch = original; }
});

test("an analysis finishing after local reset cannot repopulate the frontend curve cache", async () => {
    const original = globalThis.fetch;
    let release, started, requests = 0;
    const began = new Promise(resolve => { started = resolve; });
    globalThis.fetch = async url => {
        if (url.endsWith("interactive-assets")) return Response.json({ id: "test" });
        requests++;
        if (requests === 1) { started(); return new Promise(resolve => { release = () => resolve(Response.json(result([point(2.5)]))); }); }
        return Response.json(result([point(2.5)]));
    };
    try {
        const client = new Client({ baseUrl: "http://localhost", token: "" }), file = new File(["a"], "a.wav"), request = { keyword: "piano" };
        const operation = client.relevanceCurve(file, request);
        await began; client.clearAudio(file); release(); await operation;
        assert.equal((await client.relevanceCurve(file, request)).cached, undefined);
        assert.equal(requests, 2);
        assert.equal((await client.relevanceCurve(file, request)).cached, true);
    } finally { globalThis.fetch = original; }
});

test("NDJSON decodes split UTF-8 characters and the final line", async () => {
    const bytes = encoder.encode('{"message":"钢琴"}\n{"type":"complete"}');
    const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    const received = [];
    await readNdjson(new Response(stream), event => received.push(event));
    assert.deepEqual(received, [{ message: "钢琴" }, { type: "complete" }]);
});

test("client emits partial points before completion and caches only complete results", async () => {
    const original = globalThis.fetch;
    let controller, requests = 0;
    globalThis.fetch = async url => {
        if (url.endsWith("interactive-assets")) return Response.json({ id: "test" });
        requests++;
        return new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "Content-Type": "application/x-ndjson" } });
    };
    try {
        const client = new Client({ baseUrl: "http://localhost", token: "test" });
        const file = new File(["audio"], "audio.wav"), request = { keyword: "piano", prompts: ["piano"] }, progress = [];
        const operation = client.relevanceCurve(file, request, partial => progress.push(partial.points.length));
        while (!controller) await new Promise(resolve => setTimeout(resolve, 0));
        controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", offset: 0, total: 2, result: result([point(2.5)]) }) + "\n"));
        while (!progress.length) await new Promise(resolve => setTimeout(resolve, 0));
        assert.deepEqual(progress, [1]);
        controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", offset: 1, total: 2, result: result([point(3.5)]) }) + "\n" + JSON.stringify({ type: "complete", result: result([point(2.5), point(3.5)]) }) + "\n")); controller.close();
        assert.equal((await operation).points.length, 2);
        assert.deepEqual(progress, [1, 2]);
        assert.equal((await client.relevanceCurve(file, request)).cached, true);
        assert.equal(requests, 1);
    } finally { globalThis.fetch = original; }
});

test("truncated/error streams are retryable and never cached as complete", async () => {
    const original = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async url => {
        if (url.endsWith("interactive-assets")) return Response.json({ id: "test" });
        requests++;
        return new Response(JSON.stringify(requests === 1 ? { type: "chunk", offset: 0, total: 2, result: result([point(2.5)]) } : { type: "error", message: "Inference failed" }) + "\n", { headers: { "Content-Type": "application/x-ndjson" } });
    };
    try {
        const client = new Client({ baseUrl: "http://localhost", token: "" }), file = new File(["audio"], "audio.wav");
        await assert.rejects(client.relevanceCurve(file, { keyword: "piano" }), /before completion/);
        await assert.rejects(client.relevanceCurve(file, { keyword: "piano" }), /Inference failed/);
        assert.equal(requests, 2);
    } finally { globalThis.fetch = original; }
});

test("curve creates no request while empty and progressively paints only real timestamps", async () => {
    let advance, release, requests = 0;
    const editor = { sampleRate: 48000, duration: 60, analyzeSemanticCurve: async (_, callback) => { requests++; advance = callback; return new Promise(resolve => { release = resolve; }); } };
    const curve = await Curve.fromAudioData(editor);
    assert.equal(requests, 0);
    curve.setState({ ...curve.getState(), keyword: "piano", prompts: ["piano"] });
    advance(result([point(2.5), point(3.5)]), 40);
    assert.deepEqual([...curve.dataSlices[0].samplePositions], [120000, 168000]);
    assert.equal(curve.dataSlices[0].endIndex, 168000);
    assert.equal(curve.lastResult.points.length, 2);
    curve.setState({ ...curve.getState(), color: "#4e94ce" });
    assert.equal(requests, 1, "appearance changes must not restart inference");
    curve.cancel();
    release(result([point(2.5), point(3.5), point(59)]));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(curve.lastResult.points.length, 2, "late completion must not overwrite cancelled partial data");
    assert.deepEqual(curve.incompletePreview, [2, 40]);
    assert.equal(curve.isCalculating, false);
    curve.setState({ ...curve.getState(), keyword: "", prompts: [] });
    assert.equal(curve.dataSlices, undefined);
    assert.equal(curve.lastResult, undefined);
});
