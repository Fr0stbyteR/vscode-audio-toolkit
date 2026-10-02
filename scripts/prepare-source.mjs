import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectSourceFiles } from "./collect-source-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist", "source");
const cache = join(root, ".tmp", "release-sources");
await mkdir(output, { recursive: true });
await mkdir(cache, { recursive: true });

// Positive selection: include build inputs, never a working-tree archive with
// credentials, audio assets, model weights, caches, or Git history.
const rootFiles = [
    "package.json", "package-lock.json", ".gitignore", "LICENSE", "README.md",
    "README.zh-CN.md", "STANDALONE.md", "THIRD_PARTY_NOTICES.md", "CHANGELOG.md",
    "CONTRIBUTING.md", "SECURITY.md", "start-standalone.ps1",
    "start-standalone.cmd", "start-standalone.command",
    "app/.env.example", "app/.eslintrc.json", "app/.gitignore", "app/index.html",
    "app/package.json", "app/package-lock.json", "app/tsconfig.json", "app/vite.config.ts",
];
const files = [...rootFiles];
for (const folder of ["app/src", "app/public", "app/tests", "scripts", "docs", ".github"]) {
    files.push(...await collectSourceFiles(root, folder, { optional: folder === "app/public" }));
}
for (const path of files) {
    const destination = join(output, "audio-toolkit", path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, path), destination);
}

// The npm wrapper contains editable TS source and its native Emscripten build
// recipe; the underlying FFTW C code must be included separately.
const wrapper = join(root, "app", "node_modules", "@shren", "fftw-js");
await cp(wrapper, join(output, "fftw-js-0.1.10"), {
    recursive: true,
    filter: path => !relative(wrapper, path).split(/[\\/]/).includes("node_modules"),
});

const sources = JSON.parse(await readFile(join(root, "docs", "third-party-sources.json"), "utf8"));
for (const source of sources) {
    const installed = JSON.parse(await readFile(join(root, "app", "node_modules", source.npmPackage, "package.json"), "utf8"));
    if (installed.version !== source.npmVersion) throw new Error(`Update corresponding-source manifest for ${source.npmPackage}@${installed.version}`);
    let bytes;
    try { bytes = await readFile(join(cache, source.file)); }
    catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.log(`Downloading official source: ${source.url}`);
        const response = await fetch(source.url, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`Source download failed (${response.status}): ${source.url}`);
        bytes = Buffer.from(await response.arrayBuffer());
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== source.sha256) throw new Error(`Source checksum mismatch: ${source.file}`);
    await writeFile(join(cache, source.file), bytes);
    await writeFile(join(output, source.file), bytes);
}
await cp(join(root, "docs", "CORRESPONDING_SOURCE.md"), join(output, "README.md"));
await cp(join(root, "docs", "third-party-sources.json"), join(output, "third-party-sources.json"));
console.log("Included frontend source snapshot, FFTW wrapper, verified FFTW C and Verovio source archives in dist/source/.");
