import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createServer, normalizePath } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));

test("normal dev assets load without special exceptions; private files stay blocked", async t => {
    const vite = await createServer({
        configFile: join(root, "vite.config.ts"), logLevel: "silent",
        server: { middlewareMode: true, hmr: false }
    });
    const http = createHttpServer(vite.middlewares);
    t.after(async () => { await new Promise(resolve => http.close(resolve)); await vite.close(); });
    // Middleware mode lets Node assign a free port without touching an existing dev server.
    await new Promise((resolve, reject) => { http.once("error", reject); http.listen(0, "127.0.0.1", resolve); });
    const base = `http://127.0.0.1:${http.address().port}/`;
    assert.deepEqual(vite.config.server.fs.allow, [normalizePath(root).replace(/\/$/, "")]);
    const css = await fetch(new URL("node_modules/@vscode/codicons/dist/codicon.css?direct", base));
    assert.equal(css.status, 200);
    const fontUrl = /url\(["']?([^"')]+\.ttf[^"')]*)/.exec(await css.text())?.[1];
    assert.ok(fontUrl);
    const font = await fetch(new URL(fontUrl, base));
    assert.equal(font.status, 200);
    assert.deepEqual(Buffer.from(await font.arrayBuffer()), await readFile(join(root, "node_modules/@vscode/codicons/dist/codicon.ttf")));
    assert.equal((await fetch(new URL(".env.example", base))).status, 403);

    await mkdir(join(root, ".tmp"), { recursive: true });
    const privateFixture = await mkdtemp(join(root, ".tmp", "dev-server-check-"));
    const outsideFixture = await mkdtemp(join(tmpdir(), "audio-toolkit-dev-outside-"));
    t.after(async () => { await rm(privateFixture, { recursive: true, force: true }); await rm(outsideFixture, { recursive: true, force: true }); });
    for (const folder of [privateFixture, outsideFixture]) {
        const file = join(folder, "result.json");
        await writeFile(file, "{}");
        assert.equal((await fetch(new URL(`/@fs/${normalizePath(file)}`, base))).status, 403);
    }
});
