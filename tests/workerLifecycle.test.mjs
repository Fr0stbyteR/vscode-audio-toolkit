import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/workers/ProxyMain.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const { default: ProxyMain } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
class MockWorker {
    static last;
    constructor() { MockWorker.last = this; this.terminated = 0; this.requests = []; }
    addEventListener(_, handler) { this.handler = handler; }
    removeEventListener(_, handler) { if (this.handler === handler) this.handler = undefined; }
    terminate() { this.terminated++; }
    postMessage(request) { this.requests.push(request); }
}
class TestProxy extends ProxyMain { static Worker = MockWorker; static fnNames = ["calculate"]; }

test("disposing a worker settles pending RPCs, rejects future calls, and terminates once", async () => {
    const proxy = new TestProxy(), worker = MockWorker.last;
    const first = assert.rejects(proxy.calculate(1), { name: "AbortError" });
    const second = assert.rejects(proxy.calculate(2), { name: "AbortError" });
    proxy.dispose(); proxy.dispose();
    await first; await second;
    assert.equal(worker.terminated, 1);
    assert.equal(worker.handler, undefined);
    await assert.rejects(proxy.calculate(3), { name: "AbortError" });
    assert.equal(worker.requests.length, 2);
});

test("completed RPCs keep their results after worker disposal", async () => {
    const proxy = new TestProxy(), worker = MockWorker.last;
    const response = proxy.calculate(1);
    await worker.handler({ data: { id: worker.requests[0].id, value: 42 } });
    proxy.dispose();
    assert.equal(await response, 42);
});
