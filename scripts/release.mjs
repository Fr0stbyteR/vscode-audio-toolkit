import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.npm_execpath) throw new Error("Run npm run release:prepare from the repository root.");
// Vite prioritizes process env over .env files. A release must never bake in
// the developer's bearer token or private remote service address.
execFileSync(process.execPath, [process.env.npm_execpath, "run", "check"], {
    cwd: root, stdio: "inherit",
    env: { ...process.env, VITE_MUSIC_ANALYSIS_TOKEN: "", VITE_MUSIC_ANALYSIS_API: "http://127.0.0.1:49321/" },
});
await import("./prepare-release.mjs");
