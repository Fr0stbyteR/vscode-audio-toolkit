import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectSourceFiles } from "../../scripts/collect-source-files.mjs";

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), "audio-toolkit-release-source-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "app"));
    return root;
}

test("release accepts an absent optional public directory in a clean checkout", async t => {
    const root = await fixture(t);
    assert.deepEqual(await collectSourceFiles(root, "app/public", { optional: true }), []);
});

test("release accepts an empty public directory", async t => {
    const root = await fixture(t);
    await mkdir(join(root, "app/public"));
    assert.deepEqual(await collectSourceFiles(root, "app/public", { optional: true }), []);
});

test("release includes public assets recursively and still excludes private files", async t => {
    const root = await fixture(t);
    await mkdir(join(root, "app/public/icons"), { recursive: true });
    await writeFile(join(root, "app/public/icons/logo.svg"), "<svg/>");
    await writeFile(join(root, "app/public/.env"), "PRIVATE_TOKEN=secret");
    await writeFile(join(root, "app/public/.env.local"), "PRIVATE_TOKEN=secret");
    await writeFile(join(root, "app/public/.env.example"), "TOKEN=");
    for (const name of ["node_modules", ".git", ".audio_toolkit", "dist", ".tmp"]) {
        await mkdir(join(root, "app/public", name));
        await writeFile(join(root, "app/public", name, "private.txt"), "private");
    }
    const files = await collectSourceFiles(root, "app/public", { optional: true });
    assert.deepEqual(files.sort(), ["app/public/.env.example", "app/public/icons/logo.svg"]);
});

test("release still fails when a required source directory is missing", async t => {
    const root = await fixture(t);
    await assert.rejects(collectSourceFiles(root, "app/src"), { code: "ENOENT" });
});

test("optional directories do not swallow other filesystem errors", async t => {
    const root = await fixture(t);
    await writeFile(join(root, "app/public"), "not a directory");
    await assert.rejects(collectSourceFiles(root, "app/public", { optional: true }), { code: "ENOTDIR" });
});
