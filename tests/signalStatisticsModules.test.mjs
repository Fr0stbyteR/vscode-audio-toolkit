import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function load(path, stubComponents = false) {
    const bundle = await build({
        entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
        bundle: true, platform: "node", format: "esm", write: false,
        plugins: [{ name: "test-ui", setup(build) {
            if (stubComponents) build.onLoad({ filter: /Librosa(?:Vector|Matrix)Component\.tsx$/ }, () => ({ contents: "export default function Component() {}", loader: "js" }));
            build.onLoad({ filter: /\.scss$/ }, () => ({ contents: "", loader: "js" }));
        } }]
    });
    return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
}
const { getSignalStatisticsModules } = await load("../src/modules/librosa/SignalStatistics.ts", true);
const Modules = getSignalStatisticsModules();
const { translate } = await load("../src/i18n/LocaleContext.tsx");
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);

async function calculate(algorithm, result) {
    const Module = Modules.find(Module => Module.getAnalysisRequest().algorithm === algorithm);
    const requests = [];
    const editor = { sampleRate: 48000, duration: 3, length: 144000, analyze: async request => {
        requests.push(request);
        return structuredClone(result);
    } };
    const module = new Module(editor, { ...Module.DEFAULT_STATE });
    await module.calculate();
    assert.equal(module.isCalculating, false);
    return { module, requests };
}

test("24 statistics modules have unique IDs, cache descriptors and Chinese names", () => {
    assert.equal(Modules.length, 24);
    assert.equal(new Set(Modules.map(Module => Module.MODULE_ID)).size, 24);
    for (const Module of Modules) {
        const request = Module.getAnalysisRequest();
        assert.equal(request.engine, "librosa");
        assert.deepEqual(request.options, Module.DEFAULT_ANALYSIS_STATE);
        assert.ok(Module.DEFAULT_STATE.name);
        if (request.algorithm !== "lpcc") assert.notEqual(translate("zh", Module.MODULE_NAME), Module.MODULE_NAME);
    }
    assert.equal(translate("zh", "RMS (librosa)"), "均方根能量 (librosa)", "existing translations stay intact");
});

test("formants preserve three Vector channels, names, statistics and sample-rate mapping", async () => {
    const metadata = { hopLength: 256, "statistics.0.count": 3, "statistics.0.mean": 500, missingValue: 0 };
    const { module, requests } = await calculate("formants", {
        algorithm: "formants", vectors: [[450, 500, 550], [1400, 1500, 1600], [2400, 2500, 2600]],
        metadata, sampleRate: 16000, duration: 3
    });
    assert.deepEqual(module.channelLabels, ["F1", "F2", "F3"]);
    assert.equal(module.dataSlices[0].vectors.length, 3);
    assert.ok(module.dataSlices[0].vectors.every(vector => vector instanceof Float32Array));
    assert.equal(module.dataSlices[0].audioSamplesPerSample, 768);
    assert.deepEqual(module.analysisMetadata, metadata);
    module.setState({ ...module.state, color: "#abc", overlayOpacity: .3 });
    assert.equal(requests.length, 1, "appearance must not trigger analysis");
    module.setState({ ...module.state, lpcOrder: 18 });
    await module.analysisComplete;
    assert.equal(requests.length, 2);
    assert.equal(requests[1].options.lpcOrder, 18);
    await module.calculate(true);
    assert.equal(requests[2].cachePolicy, "refresh");
});

test("LPCC preserves signed values in the shared Matrix renderer with c1-first labels", async () => {
    const { module, requests } = await calculate("lpcc", {
        algorithm: "lpcc", matrix: [[-.5, .2, -.1], [.4, -.2, .1]],
        metadata: { hopLength: 512, minValue: -.5, maxValue: .4, firstCoefficient: 1 }, sampleRate: 16000, duration: 3
    });
    assert.equal(module.bins, 3);
    assert.deepEqual(module.binLabels, ["c1", "c2", "c3"]);
    assert.deepEqual(module.valueRange, [-.5, .4]);
    assert.ok(module.dataSlices[0].resizedMatrices.resizes.length);
    module.setState({ ...module.state, colorMap: "grayscale", colorMin: .2, opacity: .5 });
    assert.equal(requests.length, 1);
});

test("Data number formatting handles silence, signs, tiny values and corrupt metadata", async () => {
    const { formatStatistic } = await load("../src/core/RangeStatistics.ts");
    assert.equal(formatStatistic(0), "0");
    assert.equal(formatStatistic(-1.23456), "-1.235");
    assert.equal(formatStatistic(.0000000123), "1.23e-8");
    assert.equal(formatStatistic(undefined), "—");
    assert.equal(formatStatistic(Infinity), "—");
});

test("statistics panel automatically labels whole audio and selection without a scope toggle", async () => {
    const bundle = await build({
        stdin: {
            contents: `import React from "react"; import { renderToStaticMarkup } from "react-dom/server";
                import Panel from "./src/components/RangeStatisticsData";
                export const render = props => renderToStaticMarkup(React.createElement(Panel, props));`,
            resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "tsx"
        },
        bundle: true, platform: "node", format: "esm", write: false,
        banner: { js: `import { createRequire } from "node:module"; const require = createRequire(${JSON.stringify(import.meta.url)});` },
        plugins: [{ name: "ignore-test-styles", setup(build) {
            build.onLoad({ filter: /\.scss$/ }, () => ({ contents: "", loader: "js" }));
        } }]
    });
    const { render } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    const props = { source: { kind: "markers", markers: [] }, length: 16000, sampleRate: 16000 };
    const html = render(props);
    assert.match(html, /Whole-audio statistics/);
    assert.match(html, /0\.000–1\.000 s/);
    assert.match(render({ ...props, selection: [4000, 8000] }), /Selection statistics/);
    assert.match(render({ ...props, selection: [4000, 4000] }), /Whole-audio statistics/);
    assert.doesNotMatch(html, /<select|<button/);
    assert.doesNotMatch(html, /NaN|Infinity/);
    assert.equal(render({ length: 16000, sampleRate: 16000 }), "", "uncomputed modules do not invent statistics");
});
