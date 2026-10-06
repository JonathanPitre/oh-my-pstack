import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { startOmpRpc } from "./omp-rpc.mjs";

const execute = promisify(execFile);
const candidate = await realpath(resolve(import.meta.dirname, ".."));
const requested = process.env.PSTACK_OMP_MODEL;
if (!requested?.includes("/")) throw new Error("Set PSTACK_OMP_MODEL to an exact provider/model selector");
const slash = requested.indexOf("/"), colon = requested.lastIndexOf(":");
const baseSelector = colon > slash ? requested.slice(0, colon) : requested;
const requestedThinking = colon > slash ? requested.slice(colon + 1) : null;
const provider = baseSelector.slice(0, slash), modelId = baseSelector.slice(slash + 1);
let bin = process.env.PSTACK_OMP_BIN ?? "omp";
if (!isAbsolute(bin)) bin = (await execute("which", [bin], { timeout: 30_000 })).stdout.trim();
const metadata = JSON.parse((await execute(bin, ["models", "find", modelId, "--json", "--no-extensions"], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 })).stdout);
const model = metadata.models?.find(entry => entry.provider === provider && entry.id === modelId && entry.kind === "chat");
if (!model) throw new Error(`Requested model is unavailable: ${baseSelector}`);
const supportedThinking = ["off", ...(model.thinking ?? [])];
if (requestedThinking !== null && !supportedThinking.includes(requestedThinking)) throw new Error(`Unsupported thinking selector for ${baseSelector}: ${requestedThinking}`);
const thinking = requestedThinking ?? (supportedThinking.includes("low") ? "low" : "off");
const selector = `${baseSelector}:${thinking}`;
let credential = process.env.PSTACK_OMP_API_KEY;
if (credential === undefined) {
  try {
    credential = (await execute(bin, ["token", provider], { timeout: 60_000, maxBuffer: 1024 * 1024 })).stdout.trim();
  } catch (error) {
    throw new Error(`Normal OMP credential resolution failed for ${provider} (exit ${error.code ?? "unknown"}); token output is withheld`);
  }
}
if (!credential?.trim()) throw new Error(`A nonempty credential is required for ${provider}`);
const redact = value => String(value).split(credential).join("[REDACTED]").split(JSON.stringify(credential).slice(1, -1)).join("[REDACTED]");
const snapshot = async path => { try { return await readFile(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const livePaths = [".omp/agent/config.yml", ".omp/agent/settings.json", ".omp/settings.json", ".omp/plugins/package.json", ".omp/plugins/omp-plugins.lock.json"].map(path => join(process.env.HOME ?? "", path));
const liveSnapshots = new Map(await Promise.all(livePaths.map(async path => [path, await snapshot(path)])));
const root = await mkdtemp(join(tmpdir(), "pstack-omp-smoke-"));
const scenarios = [];
let rpc, lastText = "", currentScenario = "preflight";
const toolCalls = frames => frames.filter(frame => frame.type === "tool_execution_start");
const toolName = frame => frame.toolName?.split(".").at(-1);
const textOf = value => JSON.stringify(value);
const jsonText = text => JSON.parse(text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, ""));
const reported = value => typeof value === "string" ? value : value?.value;
const noPi = async project => { await assert.rejects(access(join(project, ".pi/settings.json")), { code: "ENOENT" }); };
try {
  const home = join(root, "home"), project = join(root, "project"), agentDir = join(home, ".omp/agent"), config = join(project, ".pstack/config.md");
  await Promise.all([agentDir, join(home, "tmp"), join(project, ".pstack")].map(path => mkdir(path, { recursive: true })));
  const keys = ["PATH", "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "GIT_SSL_CAINFO"];
  const safeEnvironment = Object.fromEntries(keys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const baseEnv = { ...safeEnvironment, HOME: home, PI_CODING_AGENT_DIR: agentDir, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"), XDG_CACHE_HOME: join(home, ".cache"), XDG_STATE_HOME: join(home, ".local/state"), TMPDIR: join(home, "tmp"), PSTACK_CONFIG: config };
  const env = { ...baseEnv, PSTACK_OMP_SMOKE_TOKEN: credential };
  await writeFile(join(agentDir, "models.yml"), `providers:\n  ${JSON.stringify(provider)}:\n    apiKey: PSTACK_OMP_SMOKE_TOKEN\n`, { mode: 0o600 });
  const overlay = join(home, "omp-smoke.yml");
  await writeFile(overlay, JSON.stringify({ task: { enableEffort: false, disabledAgents: ["designer", "librarian"] } }), { mode: 0o600 });
  const keepLine = "fixture-preserve: this unrelated setting must survive\n";
  await writeFile(config, keepLine);
  const fixture = 'export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));\n';
  await writeFile(join(project, "fixture.mjs"), fixture);
  await writeFile(join(project, "async-marker.mjs"), 'import { writeFile } from "node:fs/promises";\nawait new Promise(resolve => setTimeout(resolve, 45_000));\nawait writeFile("ASYNC_DONE", "finite-native-job-completed\\n");\nconsole.log("finite-native-job-completed");\n');
  for (const args of [["init", "-q", "-b", "main"], ["add", "."], ["commit", "-qm", "isolated fixture"]]) {
    await execute("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=OMP smoke", "-c", "user.email=omp-smoke@example.invalid", ...args], { cwd: project, env: baseEnv, timeout: 30_000 });
  }
  await execute(bin, ["plugin", "link", candidate], { cwd: project, env: baseEnv, timeout: 60_000 });
  const plugins = JSON.parse((await execute(bin, ["plugin", "list", "--json"], { cwd: project, env: baseEnv, timeout: 30_000 })).stdout);
  const plugin = Object.values(plugins).flat().find(entry => entry.name === "pstack-pi");
  assert.equal(await realpath(plugin.path), candidate, "smoke must resolve the candidate, not an older live plugin");
  const resource = async uri => {
    assert.ok(/^skill:\/\/[a-z0-9-]+(?:\/[a-zA-Z0-9_./-]+)?$/u.test(uri), "fixture resource must be a package skill URI");
    assert.ok(!uri.split("/").some(segment => segment === "." || segment === ".."), "fixture resource must not traverse its skill boundary");
    const [name, ...parts] = uri.slice("skill://".length).split("/");
    const boundary = await realpath(join(candidate, "skills", name));
    assert.ok(boundary.startsWith(join(candidate, "skills") + sep), "resource skill root escaped the candidate");
    const target = await realpath(join(boundary, ...(parts.length ? parts : ["SKILL.md"])));
    assert.ok(target.startsWith(boundary + sep) && (await stat(target)).isFile(), "resource must resolve to a regular file inside its named skill");
    const output = (await execute(bin, ["read", uri], { cwd: project, env: baseEnv, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 })).stdout;
    assert.ok(output.includes(plugin.path) || output.includes(candidate), `resource did not resolve through the candidate: ${uri}`);
    return uri;
  };
  for (const name of ["pstack-pi", "orchestrate-omp", "poteto-help"]) await resource(`skill://${name}`);
  const choose = (question, labels) => {
    let pattern, custom;
    if (/verification skill|app harness|create-verification-skill/iu.test(question)) { pattern = /^(?:no|skip|not now)\b/iu; custom = "No; do not create a verification skill for this fixture"; }
    else if (/budget|spend|cost/iu.test(question)) { pattern = /unlimited/iu; custom = "unlimited (keep current supported low reasoning)"; }
    else if (/unavailable|replacement|unsupported/iu.test(question)) { pattern = /keep|cancel|report/iu; custom = "Keep existing valid settings; report the unavailable model or unsupported reasoning without dispatch"; }
    else if (/panel|seats|runners|reviewers|judge pool/iu.test(question)) { pattern = /^(?:one|1)\b/iu; custom = `One entry only: ${selector}`; }
    else if (/model|provider|role/iu.test(question)) { pattern = new RegExp(baseSelector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu"); custom = selector; }
    else if (/scope|where.*(?:save|config)|project.*global/iu.test(question)) { pattern = /project|local/iu; custom = `Project only: ${config}`; }
    else if (/save|write|config|confirm|apply|setup|proceed/iu.test(question)) { pattern = /yes|save|apply|confirm|project|custom/iu; custom = `Apply the stated fixture choices only to ${config}`; }
    else throw new Error(`Unexpected fixture question: ${question}`);
    const label = labels.find(label => pattern.test(label));
    return label ? { selectedOptions: [label] } : { selectedOptions: [], customInput: custom };
  };
  const answerUi = request => {
    if (request.secret) throw new Error("Secret UI requests are not permitted");
    if (request.method === "ask") return { answers: request.questions.map(question => ({ id: question.id, ...choose(question.question, question.options.map(option => option.label)) })) };
    const question = [request.title, request.message].filter(Boolean).join(" ");
    if (request.method === "confirm") {
      if (!/fixture|project|config|setup|save/iu.test(question)) throw new Error(`Unexpected confirmation: ${question}`);
      return { confirmed: true };
    }
    const answer = choose(question, request.options ?? []);
    return { value: answer.selectedOptions[0] ?? answer.customInput };
  };
  rpc = startOmpRpc(bin, ["--mode", "rpc-ui", "--no-ui", "--no-session", "--no-extensions", "--no-rules", "--no-title", "--plugin-dir", candidate, "--model", selector, "--config", overlay], { cwd: project, env, timeoutMs: 900_000, answerUi });
  await rpc.command({ type: "set_ask_dialog", enabled: true });
  await rpc.command({ type: "set_auto_retry", enabled: false });
  await rpc.command({ type: "set_event_filter", events: null, messageUpdates: "delta" });
  await rpc.command({ type: "set_subagent_subscription", level: "progress" });
  const catalog = (await rpc.command({ type: "get_available_commands" })).data.commands;
  const actual = catalog.filter(entry => entry.source === "skill").map(entry => entry.name.replace(/^skill:/u, "")).sort();
  const expected = (await readdir(join(candidate, "skills"), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(actual, expected);
  const initial = (await rpc.command({ type: "get_state" })).data;
  assert.equal(initial.model.provider, provider); assert.equal(initial.model.id, modelId); assert.equal(initial.thinkingLevel, thinking);
  const guard = `This is an accepted smoke in a disposable project. Use only this project's files and the candidate's skills. Do not inspect or print credentials/environment values, access outside state, contact unrelated services, install extensions, publish, push, modify global settings, or install/configure a scheduler. Do not spawn nested children. All requested models are ${selector}; use the live task schema. No Pi settings apply here. `;
  const turn = async (name, message) => {
    currentScenario = name;
    const start = rpc.frames.length;
    const result = await rpc.prompt({ type: "prompt", message: `${message}\n\n${guard}` });
    const state = (await rpc.command({ type: "get_state" })).data;
    assert.equal(state.isSettled, true, `${name} returned before native settlement`);
    assert.equal(state.hasPendingAsyncWork, false, `${name} left native async work`);
    lastText = (await rpc.command({ type: "get_last_assistant_text" })).data.text ?? "";
    const frames = rpc.frames.slice(start);
    await writeFile(join(root, `${name}.json`), redact(JSON.stringify(frames)), { mode: 0o600 });
    return { result, frames, state };
  };

  const help = await turn("help", "/skill:poteto-help Explain how to set up this candidate in OMP and start a normal pstack task. Return only JSON with setupCommand and workflowCommand as single slash-command strings that exist in the real OMP catalog, plus resources as skill:// URIs for the advised setup/runtime-loading path. Do not put prompt paragraphs in the command fields. Use OMP, not Cursor commands.");
  const advice = jsonText(lastText);
  for (const [field, skill] of [["setupCommand", "skill:setup-pstack"], ["workflowCommand", "skill:poteto-mode"]]) {
    const command = advice[field];
    const entry = catalog.find(entry => [entry.name, ...(entry.aliases ?? [])].includes(command.replace(/^\//u, "")));
    assert.equal(entry?.name, skill, `advised command does not invoke the required native skill: ${command}`);
  }
  assert.ok(advice.resources.length > 0);
  for (const uri of advice.resources) await resource(uri);
  assert.ok(toolCalls(help.frames).some(frame => toolName(frame) === "read"), "help did not load its native resources");
  scenarios.push({ name: "help", commands: [advice.setupCommand, advice.workflowCommand], resources: advice.resources });

  await rpc.command({ type: "new_session" });
  const setup = await turn("setup", `${advice.setupCommand} Configure this OMP project. Use ${selector} for all workflow roles, one entry per panel, and unlimited budget (keep current supported reasoning). Use native ask to confirm the project save. Do not create a verification skill. Write the selected configuration and report its path.`);
  const validConfig = await readFile(config);
  assert.ok(validConfig.toString().includes(keepLine.trim()), "setup discarded an unrelated existing configuration line");
  assert.ok(validConfig.toString().includes(selector), "setup did not persist the confirmed model and supported thinking selector");
  assert.ok(setup.frames.some(frame => frame.type === "extension_ui_request" && frame.method === "ask"), "setup did not exercise native ask delivery");
  await noPi(project);
  scenarios.push({ name: "setup", unrelatedLinePreserved: true, nativeAsk: true, piSettingsAbsent: true });

  await rpc.command({ type: "new_session" });
  await writeFile(config, `${validConfig.toString()}\nfeature, refactoring reasoning: fixture-unsupported\n`);
  const invalidSeed = await readFile(config);
  const unavailable = `${provider}/fixture-unavailable-model`;
  const rejected = await turn("invalid-choices", `/skill:setup-pstack Check the saved fixture-unsupported reasoning entry and requested model ${unavailable}. Neither is valid. Report both rejected choices; do not dispatch a child, substitute a model, or modify the existing configuration. Then verify that ${selector} remains a supported thinking selector even though the task effort field is absent. Return only JSON whose rejectedModel, rejectedReasoning, and supportedSelector fields are those exact strings, or objects whose value is that string.`);
  const rejection = jsonText(lastText);
  assert.equal(reported(rejection.rejectedModel), unavailable); assert.equal(reported(rejection.rejectedReasoning), "fixture-unsupported"); assert.equal(reported(rejection.supportedSelector), selector);
  assert.ok(!toolCalls(rejected.frames).some(frame => toolName(frame) === "task"), "invalid choices reached task dispatch");
  assert.ok((await readFile(config)).equals(invalidSeed), "rejected choices modified existing settings");
  await rpc.command({ type: "set_thinking_level", level: thinking });
  const reasoningState = (await rpc.command({ type: "get_state" })).data;
  assert.equal(reasoningState.thinkingLevel, thinking);
  await writeFile(config, validConfig);
  await noPi(project);
  scenarios.push({ name: "invalid-choices", noInvalidDispatch: true, settingsPreserved: true, supportedThinkingApplied: thinking });

  await rpc.command({ type: "new_session" });
  const workflow = await turn("workflow", `${advice.workflowCommand} Investigate fixture.mjs without editing it. Use canonical planner and researcher roles, mapped through pstack-pi to the available native agents; designer and librarian are disabled. Start independent planning/research together with standalone briefs and ${selector}. The planner must report PLAN_NATIVE_PROOF and the researcher RESEARCH_NATIVE_PROOF plus the actual results of clamp(-2,0,5) and clamp(9,0,5). Read each full child result through its native agent resource, not a preview. Return only JSON with lower: 0, upper: 5, and consumedReports listing both proof markers.`);
  const tasks = toolCalls(workflow.frames).filter(frame => toolName(frame) === "task");
  assert.ok(tasks.length > 0, "workflow did not invoke native task");
  const participants = tasks.flatMap(frame => frame.args?.tasks ?? [frame.args]);
  assert.ok(participants.length >= 2, "workflow omitted the independent planner/research coverage");
  for (const participant of participants) {
    assert.ok(!["designer", "librarian"].includes(participant.agent), "disabled agent reached dispatch");
    assert.ok(participant.effort === undefined, "hidden effort field reached dispatch");
    if (participant.model !== undefined) assert.equal(participant.model, selector, "workflow substituted the selected model");
  }
  const fullReads = toolCalls(workflow.frames).filter(frame => toolName(frame) === "read" && /^agent:\/\//u.test(frame.args?.path ?? ""));
  assert.ok(fullReads.length >= 2, "workflow did not consume full native child results");
  const report = jsonText(lastText);
  assert.equal(report.lower, 0); assert.equal(report.upper, 5);
  assert.deepEqual([...report.consumedReports].sort(), ["PLAN_NATIVE_PROOF", "RESEARCH_NATIVE_PROOF"].sort());
  const deliveries = workflow.frames.filter(frame => frame.type === "tool_execution_end" && toolName(frame) === "read" && textOf(frame.result).includes("NATIVE_PROOF"));
  assert.ok(deliveries.some(frame => textOf(frame.result).includes("PLAN_NATIVE_PROOF")) && deliveries.some(frame => textOf(frame.result).includes("RESEARCH_NATIVE_PROOF")), "proof markers did not arrive through real full-result reads");
  assert.equal(await readFile(join(project, "fixture.mjs"), "utf8"), fixture);
  scenarios.push({ name: "workflow", participants: participants.map(item => ({ name: item.name, agent: item.agent ?? "default (omitted)", model: item.model ?? "inherited" })), fullResultReads: fullReads.length, lower: report.lower, upper: report.upper });

  await rpc.command({ type: "new_session" });
  const lifecycle = await turn("lifecycle", `/skill:pstack-pi Launch node async-marker.mjs using the live native bash async facility, not a shell background process. After launching, write the manual checkpoint and stop that turn so the host can yield while the finite job is still pending. Do not wait, poll, sleep, or inspect ASYNC_DONE in the launch turn. Consume the native delivery on the follow-up wake, then inspect ASYNC_DONE. An hourly audit was requested, but this fixture has no scheduler capability: do not install or promise one. Record a manual checkpoint at .pstack/hourly-audit.md with the next exact command and explain that a completed agent id cannot revive a session. Finish only when the finite job and checkpoint are complete.`);
  assert.equal(await readFile(join(project, "ASYNC_DONE"), "utf8"), "finite-native-job-completed\n");
  const asyncCalls = toolCalls(lifecycle.frames).filter(frame => toolName(frame) === "bash" && frame.args?.async === true && frame.args?.command?.includes("async-marker.mjs"));
  assert.ok(asyncCalls.length > 0, "lifecycle did not launch the finite fixture through native asynchronous bash");
  assert.ok(lifecycle.frames.some(frame => frame.type === "prompt_result" && frame.sessionSettled === false), "finite asynchronous work did not exercise yield before settlement");
  assert.ok(lifecycle.frames.some(frame => frame.type === "session_settled"), "native session never settled after async delivery");
  assert.ok((await readFile(join(project, ".pstack/hourly-audit.md"), "utf8")).includes("async-marker.mjs"), "checkpoint omitted the exact resumable command");
  await noPi(project);
  scenarios.push({ name: "lifecycle", nativeAsync: true, yieldThenSettled: true, markerObserved: true, manualCheckpoint: true });

  await rpc.close();
  const manifest = JSON.parse(await readFile(join(candidate, "package.json")));
  const lock = JSON.parse(await readFile(join(candidate, "upstream.lock.json")));
  const summary = { runtime: (await execute(bin, ["--version"], { timeout: 30_000 })).stdout.trim(), source: candidate, forkVersion: manifest.version, sourceCommit: lock.commit, sourceVersion: lock.version, model: baseSelector, thinkingLevel: thinking, configuredTaskEffort: false, skillCount: actual.length, scenarios };
  await writeFile(join(root, "summary.json"), redact(JSON.stringify(summary)), { mode: 0o600 });
  console.log(redact(JSON.stringify(summary)));
} catch (error) {
  const calls = rpc ? toolCalls(rpc.frames).map(frame => ({ name: frame.toolName, args: frame.args })) : [];
  const promptResults = rpc ? rpc.frames.filter(frame => frame.type === "prompt_result").map(frame => ({ id: frame.id, status: frame.status, sessionSettled: frame.sessionSettled, agentInvoked: frame.agentInvoked })) : [];
  console.error(redact(JSON.stringify({ scenario: currentScenario, error: error.message, nativeError: error.cause?.error, completed: scenarios, promptResults, toolCalls: calls, lastAssistantText: lastText })));
  process.exitCode = 1;
} finally {
  try {
    await rpc?.close();
    for (const [path, bytes] of liveSnapshots) {
      const current = await snapshot(path);
      assert.ok(bytes === null ? current === null : current?.equals(bytes), `live configuration changed: ${path}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
