import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const MAX_FRAME_BYTES = 1_048_576;
const MAX_EVIDENCE_BYTES = 8 * MAX_FRAME_BYTES;
const MAX_FRAMES = 32_768;

export function startOmpRpc(bin, args, { cwd, env, timeoutMs = 120_000, answerUi } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("RPC timeout must be positive and finite");
  const grouped = process.platform !== "win32";
  const child = spawn(bin, args, { cwd, env, detached: grouped, stdio: ["pipe", "pipe", "pipe"] });
  const frames = [], waiters = new Map();
  let sequence = 0, evidenceBytes = 0, frameBytes = 0, stderrBytes = 0, stderr = "";
  let failure, closing, processClosed = false, inputEnded = false;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const rejectPending = error => {
    for (const waiter of waiters.values()) waiter.reject(error);
    waiters.clear();
  };
  const signal = name => {
    if (!child.pid) return;
    try { grouped ? process.kill(-child.pid, name) : child.kill(name); }
    catch (error) { if (error.code !== "ESRCH") fail(error); }
  };
  function close() {
    if (closing) return closing;
    closing = (async () => {
      clearTimeout(watchdog);
      rejectPending(failure ?? new Error("OMP RPC closed"));
      if (!processClosed && !child.stdin.destroyed) {
        child.stdin.write(`${JSON.stringify({ type: "abort", id: "shutdown" })}\n`);
        child.stdin.end();
      }
      const terminate = setTimeout(() => signal("SIGTERM"), 1000);
      const kill = setTimeout(() => signal("SIGKILL"), 3000);
      await closed;
      clearTimeout(terminate);
      clearTimeout(kill);
    })();
    return closing;
  }
  function fail(error) {
    if (failure) return;
    failure = error;
    rejectPending(error);
    void close();
  }
  const watchdog = setTimeout(() => fail(new Error("OMP RPC execution timed out")), timeoutMs);
  child.once("error", fail);
  child.stdin.on("error", fail);
  child.stderr.on("data", chunk => {
    stderrBytes += chunk.length;
    if (stderrBytes > MAX_FRAME_BYTES) fail(new Error("OMP RPC stderr overflow"));
    else stderr += chunk.toString("utf8");
  });
  child.stdout.on("data", chunk => {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline + 1;
      frameBytes += end - offset;
      if (frameBytes > MAX_FRAME_BYTES) { fail(new Error("OMP RPC physical frame overflow")); return; }
      if (newline >= 0) frameBytes = 0;
      offset = end;
    }
  });
  child.stdout.once("end", () => {
    inputEnded = true;
    if (frameBytes !== 0) fail(new Error("OMP RPC unterminated frame"));
  });
  child.once("close", (code, signalName) => {
    processClosed = true;
    if (!closing) fail(new Error(`OMP RPC exited ${code ?? signalName}${stderr ? `: ${stderr.trim()}` : ""}`));
    resolveClosed();
  });
  const write = message => {
    if (failure || closing || processClosed) throw failure ?? new Error("OMP RPC closed");
    const line = `${JSON.stringify(message)}\n`;
    if (Buffer.byteLength(line) > MAX_FRAME_BYTES) throw new Error("OMP RPC request exceeds its frame limit");
    child.stdin.write(line);
  };
  const lines = createInterface({ input: child.stdout, terminal: false });
  lines.on("line", line => {
    if (failure || (inputEnded && frameBytes !== 0)) return;
    try {
      if (!line.trim()) throw new Error("OMP RPC empty frame");
      const frame = JSON.parse(line);
      if (!frame || Array.isArray(frame) || typeof frame !== "object" || typeof frame.type !== "string") throw new Error("OMP RPC malformed frame");
      evidenceBytes += Buffer.byteLength(line) + 1;
      if (evidenceBytes > MAX_EVIDENCE_BYTES || frames.length >= MAX_FRAMES) throw new Error("OMP RPC evidence overflow");
      frames.push(frame);
      if (frame.type === "rpc_frame_error" || frame.type === "rpc_chunk") throw new Error("OMP RPC proof exceeds the supported v1 transport");
      const waiter = waiters.get(frame.id);
      if (frame.type === "response" && waiter) {
        if (typeof frame.success !== "boolean" || frame.command !== waiter.command) throw new Error("OMP RPC malformed command response");
        if (!frame.success) {
          waiters.delete(frame.id);
          waiter.reject(new Error(`OMP ${frame.command} failed: ${frame.error ?? "unknown error"}`, { cause: frame }));
        } else if (!waiter.prompt || frame.data?.agentInvoked === false) {
          waiters.delete(frame.id);
          waiter.resolve(frame);
        }
      } else if (frame.type === "prompt_result" && waiter?.prompt) {
        if (!["completed", "aborted", "error"].includes(frame.status) || typeof frame.sessionSettled !== "boolean") throw new Error("OMP RPC malformed prompt result");
        if (frame.status !== "completed") {
          waiters.delete(frame.id);
          waiter.reject(new Error(`OMP prompt ${frame.status}`, { cause: frame }));
        } else if (frame.sessionSettled) {
          waiters.delete(frame.id);
          waiter.resolve(frame);
        } else waiter.result = frame;
      } else if (frame.type === "session_settled") {
        for (const [id, pending] of waiters) {
          if (!pending.result) continue;
          waiters.delete(id);
          pending.resolve(pending.result);
        }
      } else if (frame.type === "extension_ui_request") {
        if (["notify", "setStatus", "setWidget", "setTitle", "set_editor_text", "cancel"].includes(frame.method)) return;
        if (!answerUi || !["ask", "select", "confirm", "input", "editor"].includes(frame.method)) throw new Error(`Unsupported OMP UI dialog: ${frame.method}`);
        Promise.resolve().then(() => answerUi(frame)).then(answer => {
          if (!answer || typeof answer !== "object" || Array.isArray(answer)) throw new Error("OMP UI responder did not supply an answer");
          write({ ...answer, type: "extension_ui_response", id: frame.id });
        }).catch(fail);
      }
    } catch (error) { fail(error); }
  });
  const request = (message, prompt) => new Promise((resolve, reject) => {
    const id = `pstack-${++sequence}`;
    try {
      if (prompt && !["prompt", "abort_and_prompt"].includes(message.type)) throw new Error("OMP prompt requires a prompt command");
      waiters.set(id, { resolve, reject, prompt, command: message.type });
      write({ ...message, id });
    } catch (error) {
      waiters.delete(id);
      reject(error);
    }
  });
  return { command: message => request(message, false), prompt: message => request(message, true), frames, close };
}
