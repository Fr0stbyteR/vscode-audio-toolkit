import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));

test("release manifests and lockfiles consistently declare GPL-3.0-or-later", () => {
    for (const folder of ["", "app/"]) {
        const pkg = json(`${folder}package.json`), lock = json(`${folder}package-lock.json`);
        assert.equal(pkg.license, "GPL-3.0-or-later");
        assert.equal(lock.packages[""].license, pkg.license);
        assert.equal(lock.packages[""].version, pkg.version);
        assert.equal(pkg.private, true);
    }
    assert.equal(json("package.json").version, json("app/package.json").version);
});

test("both READMEs reference actual JPEG K545 screenshots", () => {
    for (const path of ["README.md", "README.zh-CN.md"]) {
        const text = readFileSync(new URL(path, root), "utf8");
        const images = [...text.matchAll(/!\[[^\]]*\]\((docs\/screenshots\/[^)]+)\)/g)];
        assert.equal(images.length, 3);
        for (const [, image] of images) {
            const bytes = readFileSync(new URL(image, root));
            assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
            assert.ok(bytes.length > 10_000);
        }
    }
});

test("native source archives are version-matched and checksum-pinned", () => {
    const lock = json("app/package-lock.json");
    for (const source of json("docs/third-party-sources.json")) {
        assert.match(source.sha256, /^[0-9a-f]{64}$/);
        assert.match(source.url, /^https:\/\/(fftw\.org|codeload\.github\.com)\//);
        assert.equal(lock.packages[`node_modules/${source.npmPackage}`].version, source.npmVersion);
    }
});
