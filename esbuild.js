// @ts-check

const esbuild = require("esbuild");
const path = require("path");
const polyfill = require("@esbuild-plugins/node-globals-polyfill");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * This plugin hooks into the build process to print errors in a format that the problem matcher in
 * Visual Studio Code can understand.
 * @type {import("esbuild").Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started");
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location?.file}:${location?.line}:${location?.column}:`);
			});
			console.log("[watch] build finished");
		});
	},
};


/**
 * For web extension, all tests, including the test runner, need to be bundled into
 * a single module that has a exported `run` function .
 * This plugin bundles implements a virtual file extensionTests.ts that bundles all these together.
 * @type- {import("esbuild").Plugin}
 */
/*
const testBundlePlugin = {
	name: "testBundlePlugin",
	setup(build) {
		const glob = require("glob");
		build.onResolve({ filter: /[\/\\]extensionTests\.ts$/ }, args => {
			if (args.kind === "entry-point") {
				return { path: path.resolve(args.path) };
			}
		});
		build.onLoad({ filter: /[\/\\]extensionTests\.ts$/ }, async args => {
			const testsRoot = path.join(__dirname, "src/web/test/suite");
			const files = await glob.glob("*.test.{ts,tsx}", { cwd: testsRoot, posix: true });
			return {
				contents:
					`export { run } from "./mochaTestRunner.ts";` +
					files.map(f => `import("./${f}");`).join(""),
				watchDirs: files.map(f => path.dirname(path.resolve(testsRoot, f))),
				watchFiles: files.map(f => path.resolve(testsRoot, f))
			};
		});
	}
};
*/

async function main() {
	const shared = {
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		external: ["vscode"],
		logLevel: "silent",
	};
	const webCtx = await esbuild.context({
		...shared,
		entryPoints: ["src/web/extension.ts"],
		platform: "browser",
		outdir: "dist/web",
		// Node.js global to browser globalThis
		define: {
			global: "globalThis",
		},

		plugins: [
			polyfill.NodeGlobalsPolyfillPlugin({
				process: true,
				buffer: true,
			}),
//			testBundlePlugin,
			esbuildProblemMatcherPlugin, /* add to the end of plugins array */
		],
	});
	const nodeCtx = await esbuild.context({
		...shared,
		entryPoints: ["src/node/extension.ts"],
		platform: "node",
		outdir: "dist/node",
		plugins: [esbuildProblemMatcherPlugin],
	});
	if (watch) {
		await Promise.all([webCtx.watch(), nodeCtx.watch()]);
	} else {
		await Promise.all([webCtx.rebuild(), nodeCtx.rebuild()]);
		await Promise.all([webCtx.dispose(), nodeCtx.dispose()]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
