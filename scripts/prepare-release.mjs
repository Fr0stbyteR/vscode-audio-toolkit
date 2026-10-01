import { cp, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "app"), output = join(root, "dist");
await stat(join(output, "index.html")); // Build first; never copy a development .env.

// Include dependencies used by source imports, even when erroneously classified
// as devDependencies in package.json. Type-only imports overinclude safely.
const packages = new Set();
async function scan(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) await scan(path);
        else if (/\.(tsx?|[cm]?js|s?css)$/.test(entry.name)) {
            const source = await readFile(path, "utf8");
            for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)) {
                const specifier = match[1];
                if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.includes(":") || ["fs", "path", "url", "crypto", "module"].includes(specifier)) continue;
                packages.add(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]);
            }
        }
    }
}
await scan(join(app, "src"));

async function locate(name, from) {
    for (let folder = from; ; folder = dirname(folder)) {
        const path = join(folder, "node_modules", name, "package.json");
        try { await stat(path); return dirname(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
        if (folder === dirname(folder)) throw new Error(`Missing installed dependency: ${name}`);
    }
}
const inventory = new Map();
async function include(name, from) {
    const folder = await locate(name, from), pkg = JSON.parse(await readFile(join(folder, "package.json"), "utf8"));
    const key = `${pkg.name}@${pkg.version}`;
    if (inventory.has(key)) return;
    if (!pkg.license) throw new Error(`Missing license declaration: ${key}`);
    const destination = join(output, "third-party-licenses", key.replace(/[@/]/g, "_"));
    await mkdir(destination, { recursive: true });
    const entry = { name: pkg.name, version: pkg.version, license: pkg.license,
        repository: typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url,
        licenseFiles: [], warnings: [] };
    inventory.set(key, entry);
    for (const item of await readdir(folder, { withFileTypes: true })) {
        if (!/^(licen[cs]e|copying|notice)/i.test(item.name)) continue;
        await cp(join(folder, item.name), join(destination, item.name), { recursive: item.isDirectory() });
        entry.licenseFiles.push(item.name);
    }
    if (pkg.name === "verovio") {
        for (const name of ["COPYING", "COPYING.LESSER"]) {
            await copyFile(join(root, "docs", "licenses", `verovio-${name}`), join(destination, name));
            entry.licenseFiles.push(name);
        }
        entry.warnings.push("Check separate embedded font/resource licenses and LGPL distribution requirements.");
    }
    const fastVersions = {
        "@microsoft/fast-element": "1.13.0",
        "@microsoft/fast-foundation": "2.49.6",
        "@microsoft/fast-react-wrapper": "0.3.24",
        "@microsoft/fast-web-utilities": "5.4.1",
    };
    if (fastVersions[pkg.name] === pkg.version) {
        await copyFile(join(root, "docs", "licenses", "fast-MIT.txt"), join(destination, "LICENSE"));
        entry.licenseFiles.push("LICENSE");
        entry.licenseSource = `https://github.com/microsoft/fast/blob/${pkg.name === "@microsoft/fast-web-utilities" ? "c49a98f7f1bd8e167b0b7a96a181990f9a675f34" : "7f8e2db596277e78fddd88a6c99444ca64f5e771"}/LICENSE`;
    }
    if (!entry.licenseFiles.length) {
        await copyFile(join(folder, "package.json"), join(destination, "package.json"));
        try { await copyFile(join(folder, "README.md"), join(destination, "README.md")); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        entry.warnings.push("No standalone license text in installed npm artifact. Package metadata is retained, not a substitute license. Resolve upstream attribution before public binary distribution.");
    }
    if (/\bGPL-/i.test(String(pkg.license))) entry.warnings.push("GPL dependency: retain corresponding source and rebuild instructions with this GPL distribution.");
    for (const dependency of Object.keys(pkg.dependencies ?? {})) await include(dependency, folder);
}
for (const name of [...packages].sort()) await include(name, app);
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md", "STANDALONE.md"]) await copyFile(join(root, name), join(output, name));
const records = [...inventory.values()].sort((a, b) => a.name.localeCompare(b.name));
await writeFile(join(output, "third-party-inventory.json"), JSON.stringify(records, null, 2) + "\n");
await copyFile(join(root, "docs", "RELEASING.md"), join(output, "RELEASE_GUIDE.md"));
await import("./prepare-source.mjs");
console.log(`Prepared dist/ with ${records.length} dependency notices. No audio, .env, tokens or backend weights copied.`);
for (const entry of records) for (const warning of entry.warnings) console.warn(`${entry.name}: ${warning}`);
