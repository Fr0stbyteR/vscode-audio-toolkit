import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Vite's public directory is optional and may be absent in a clean checkout:
// Git does not track empty directories. Only the requested root may be optional;
// missing descendants and other filesystem errors must still fail the release.
export async function collectSourceFiles(root, folder, { optional = false } = {}) {
    let entries;
    try {
        entries = await readdir(join(root, folder), { withFileTypes: true });
    } catch (error) {
        if (optional && error.code === "ENOENT") return [];
        throw error;
    }
    const files = [];
    for (const entry of entries) {
        if (["node_modules", ".git", ".audio_toolkit", "dist", ".tmp"].includes(entry.name)) continue;
        if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
        const path = `${folder}/${entry.name}`;
        if (entry.isSymbolicLink()) throw new Error(`Review source symlink before release: ${path}`);
        if (entry.isDirectory()) files.push(...await collectSourceFiles(root, path));
        else files.push(path);
    }
    return files;
}
