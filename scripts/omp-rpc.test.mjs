import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startOmpRpc } from "./omp-rpc.mjs";

async function withFrames(handler, run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "omp-rpc-transition-"));
  let rpc;
  try {
    const executable = join(directory, "frames.mjs");
    await writeFile(executable, `
      import { createInterface } from "node:readline";
      const emit = frame => process.stdout.write(JSON.stringify(frame) + "\\n");
      const ack = request => emit({ type: "response", id: request.id, command: request.type, success: true, data: {} });
      let promptId;
      createInterface({ input: process.stdin }).on("line", line => {
        const request = JSON.parse(line);
        ${handler}
      });
    `);
    rpc = startOmpRpc(process.execPath, [executable], { cwd: directory, env: process.env, timeoutMs: 5000, ...options });
    await run(rpc);
  } finally {
    await rpc?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("a successful acknowledgement does not mask a provider failure", async () => {
  await withFrames(`
    ack(request);
    if (request.type === "prompt") emit({ type: "prompt_result", id: request.id, status: "error", error: { message: "provider refused" }, sessionSettled: true });
  `, async rpc => {
    let state = "pending";
    const result = rpc.prompt({ type: "prompt", message: "fixture" }).then(() => { state = "completed"; }, () => { state = "rejected"; });
    await rpc.command({ type: "get_state" });
    assert.equal(state, "rejected");
    await result;
    await rpc.command({ type: "get_state" });
  });
});

test("a late failed command response rejects an acknowledged prompt", async () => {
  await withFrames(`
    ack(request);
    if (request.type === "prompt") emit({ type: "response", id: request.id, command: "prompt", success: false, error: "admitted work failed" });
  `, async rpc => {
    let state = "pending";
    const result = rpc.prompt({ type: "prompt", message: "fixture" }).then(() => { state = "completed"; }, () => { state = "rejected"; });
    await rpc.command({ type: "get_state" });
    assert.equal(state, "rejected");
    await result;
  });
});

test("prompt remains pending after yield until native settlement", async () => {
  await withFrames(`
    ack(request);
    if (request.type === "prompt") {
      emit({ type: "agent_end", yielded: true });
      emit({ type: "prompt_result", id: request.id, status: "completed", sessionSettled: false });
    }
    if (request.type === "release") emit({ type: "session_settled" });
  `, async rpc => {
    let completed = false;
    const result = rpc.prompt({ type: "prompt", message: "fixture" }).then(value => { completed = true; return value; });
    await rpc.command({ type: "get_state" });
    assert.equal(completed, false);
    await rpc.command({ type: "release" });
    assert.equal((await result).status, "completed");
  });
});

test("unrelated prompt results and early settlement cannot complete the current prompt", async () => {
  await withFrames(`
    ack(request);
    if (request.type === "prompt") {
      promptId = request.id;
      emit({ type: "prompt_result", id: "stale-id", status: "completed", sessionSettled: true });
      emit({ type: "session_settled" });
      emit({ type: "agent_end", yielded: true });
    }
    if (request.type === "release") emit({ type: "prompt_result", id: promptId, status: "completed", sessionSettled: true });
  `, async rpc => {
    let completed = false;
    const result = rpc.prompt({ type: "prompt", message: "fixture" }).then(value => { completed = true; return value; });
    await rpc.command({ type: "get_state" });
    assert.equal(completed, false);
    await rpc.command({ type: "release" });
    await result;
    assert.equal(completed, true);
  });
});

test("synchronous local completion does not wait for a nonexistent agent turn", async () => {
  await withFrames(`
    emit({ type: "response", id: request.id, command: request.type, success: true, data: { agentInvoked: false } });
  `, async rpc => {
    const result = await rpc.prompt({ type: "prompt", message: "/local" });
    assert.equal(result.type, "response");
    assert.equal(rpc.frames.some(frame => frame.type === "prompt_result"), false);
  });
});

for (const [label, frame] of [
  ["malformed JSON", 'process.stdout.write("not-json\\n");'],
  ["a malformed frame object", 'emit({ message: "missing type" });'],
  ["a transport overflow", 'emit({ type: "rpc_frame_error", error: "oversized proof" });'],
  ["an oversized unterminated frame", 'process.stdout.write("x".repeat(1_048_577));'],
  ["an unsupported UI dialog", 'emit({ type: "extension_ui_request", id: "dialog", method: "ask", questions: [] });'],
]) {
  test(`${label} rejects pending work`, async () => {
    await withFrames(frame, async rpc => {
      await assert.rejects(rpc.prompt({ type: "prompt", message: "fixture" }));
      await assert.rejects(rpc.command({ type: "get_state" }));
    });
  });
}

test("child exit rejects pending work and subsequent requests", async () => {
  await withFrames('process.exit(3);', async rpc => {
    await assert.rejects(rpc.prompt({ type: "prompt", message: "fixture" }));
    await assert.rejects(rpc.command({ type: "get_state" }));
  });
});

test("the watchdog bounds an unresponsive native process", async () => {
  await withFrames('', async rpc => {
    await assert.rejects(rpc.prompt({ type: "prompt", message: "fixture" }));
    await assert.rejects(rpc.command({ type: "get_state" }));
  }, { timeoutMs: 100 });
});

test("close rejects in-flight work and terminates the owned process", async () => {
  await withFrames(`
    if (request.type === "get_state") emit({ type: "response", id: request.id, command: request.type, success: true, data: { pid: process.pid } });
  `, async rpc => {
    const { data: { pid } } = await rpc.command({ type: "get_state" });
    const pending = rpc.prompt({ type: "prompt", message: "fixture" });
    const rejection = assert.rejects(pending);
    await rpc.close();
    await rejection;
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    await assert.rejects(rpc.command({ type: "get_state" }));
  });
});
