import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdtemp, mkdir, open, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { startOmpRpc } from "./omp-rpc.mjs";

const execFileAsync = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicSource = "https://github.com/JonathanPitre/oh-my-pstack";
const requestedSource = process.env.PSTACK_INSTALL_SOURCE ?? "candidate";
const requiredSkills = ["setup-pstack", "poteto-mode"];
const hostBins = Object.fromEntries([
  ["omp", "PSTACK_OMP_BIN"], ["pi", "PSTACK_PI_BIN"],
  ["opencode", "PSTACK_OPENCODE_BIN"], ["claude", "PSTACK_CLAUDE_BIN"],
  ["codex", "PSTACK_CODEX_BIN"], ["gemini", "PSTACK_GEMINI_BIN"],
].map(([host, variable]) => [host, process.env[variable] ?? host]));
const selectedHosts = new Set(process.env.PSTACK_INSTALL_HOSTS === undefined
  ? Object.keys(hostBins)
  : process.env.PSTACK_INSTALL_HOSTS.split(",").map(host => host.trim()));
if ([...selectedHosts].some(host => !Object.hasOwn(hostBins, host))) throw new Error("PSTACK_INSTALL_HOSTS must contain comma-separated host keys: omp, pi, opencode, claude, codex, gemini");
const envAllowlist = ["PATH", "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "GIT_SSL_CAINFO"];
const liveHome = process.env.HOME ?? "";
const livePaths = [
  ".omp/settings.json", ".omp/agent/settings.json", ".omp/agent/config.yml", ".omp/plugins/omp-plugins.lock.json", ".omp/plugins/package.json", ".omp/plugins/bun.lock",
  ".pi/agent/settings.json", ".pi/agent/npm/package.json", ".pi/agent/npm/package-lock.json",
  ".claude/settings.json", ".claude/plugins/installed_plugins.json", ".claude/plugins/known_marketplaces.json",
  ".codex/config.toml", ".gemini/settings.json", ".config/opencode/opencode.json", ".config/opencode/opencode.jsonc",
].map((path) => join(liveHome, path));

function under(path, root) {
  const suffix = relative(root, path);
  return suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`));
}

async function snapshot(path) {
  try { return await readFile(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function command(bin, args, ctx, fileCapture = false) {
  let stdout = "", stderr = "";
  ctx.lastCommand = `${bin} ${args.join(" ")}`;
  try {
    if (fileCapture) {
      // OpenCode 1.18.34 exits before large piped catalogs finish flushing.
      const outPath = join(ctx.root, "stdout");
      const errPath = join(ctx.root, "stderr");
      const out = await open(outPath, "w");
      const err = await open(errPath, "w");
      try {
        const child = spawn(bin, args, { cwd: ctx.cwd, env: ctx.env, stdio: ["ignore", out.fd, err.fd] });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 120_000);
        const code = await new Promise((resolveExit, reject) => {
          child.once("error", reject);
          child.once("close", resolveExit);
        }).finally(() => clearTimeout(timer));
        stdout = await readFile(outPath, "utf8");
        stderr = await readFile(errPath, "utf8");
        assert.equal(timedOut, false, "command timed out");
        assert.equal(code, 0, `command exited ${code}`);
      } finally { await out.close(); await err.close(); }
    } else {
      ({ stdout, stderr } = await execFileAsync(bin, args, { cwd: ctx.cwd, env: ctx.env, timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024 }));
    }
    ctx.lastCommand = `${bin} ${args.join(" ")}\nstderr: ${stderr || "(empty)"}`;
    return stdout;
  } catch (error) {
    throw new Error(`${ctx.host} ${ctx.version ?? "(version unknown)"}: ${bin} ${args.join(" ")}\n${stderr || error.stderr || error.message}`, { cause: error });
  }
}

async function rpc(bin, args, ctx, run) {
  ctx.lastCommand = `${bin} ${args.join(" ")}`;
  const child = spawn(bin, args, { cwd: ctx.cwd, env: ctx.env, stdio: ["pipe", "pipe", "pipe"] });
  let pending = "", stderr = "", failure;
  const replies = new Map();
  const fail = (error) => {
    failure = error;
    for (const reply of replies.values()) reply.reject(error);
    replies.clear();
  };
  const closed = new Promise((resolveClose) => child.once("close", (code) => {
    fail(new Error(`${ctx.host} RPC exited ${code}: ${stderr}`));
    resolveClose(code);
  }));
  child.once("error", fail);
  child.stdin.on("error", fail);
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
    ctx.lastCommand = `${bin} ${args.join(" ")}\nstderr: ${stderr}`;
  });
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    pending += chunk;
    for (;;) {
      const newline = pending.indexOf("\n");
      if (newline < 0) break;
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        const reply = replies.get(message.id);
        if (reply) { replies.delete(message.id); reply.resolve(message); }
      } catch (error) { fail(new Error(`${ctx.host} malformed RPC response: ${error.message}\n${stderr}`)); }
    }
  });
  const request = (message) => new Promise((resolveReply, reject) => {
    if (failure) { reject(failure); return; }
    replies.set(message.id, { resolve: resolveReply, reject });
    child.stdin.write(`${JSON.stringify(message)}\n`);
  });
  const timer = setTimeout(() => {
    fail(new Error(`${ctx.host} ${ctx.version}: ${bin} ${args.join(" ")} timed out\n${stderr}`));
    child.kill("SIGKILL");
  }, 120_000);
  try {
    return await run(request, (message) => child.stdin.write(`${JSON.stringify(message)}\n`));
  } finally {
    child.stdin.end();
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    await closed;
    clearTimeout(killTimer);
    clearTimeout(timer);
  }
}

async function skillNames(source) {
  return (await readdir(join(source, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function absent(names, host) {
  for (const name of requiredSkills) assert.ok(!names.includes(name), `${host} baseline already discovers ${name}`);
}

function inventory(actual, expected, host) {
  for (const name of requiredSkills) assert.ok(actual.includes(name), `${host} catalog missing ${name}`);
  assert.deepEqual([...actual].sort(), expected, `${host} skill inventory differs from the installed package`);
}

async function setup(host) {
  const root = await mkdtemp(join(tmpdir(), `pstack-${host}-`));
  try {
    const home = join(root, "home"), cwd = join(root, "project");
    await Promise.all([home, cwd, join(home, "tmp"), join(home, ".codex")].map((path) => mkdir(path, { recursive: true })));
    const env = Object.fromEntries(envAllowlist.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
    Object.assign(env, { HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local", "share"), XDG_CACHE_HOME: join(home, ".cache"), XDG_STATE_HOME: join(home, ".local", "state"), TMPDIR: join(home, "tmp") });
    if (host === "pi") Object.assign(env, { PI_CODING_AGENT_DIR: join(home, ".pi", "agent"), PI_OFFLINE: "1", PI_TELEMETRY: "0" });
    if (host === "omp") env.PI_CODING_AGENT_DIR = join(home, ".omp", "agent");
    if (host === "claude") Object.assign(env, { CLAUDE_CONFIG_DIR: join(home, ".claude"), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" });
    if (host === "codex") env.CODEX_HOME = join(home, ".codex");
    if (host === "gemini") {
      env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = join(home, "empty-system.json");
      env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH = join(home, "empty-defaults.json");
      await writeFile(env.GEMINI_CLI_SYSTEM_SETTINGS_PATH, JSON.stringify({ general: { enableAutoUpdate: false } }));
      await writeFile(env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH, "{}");
    }
    const isPublic = requestedSource === publicSource;
    const source = isPublic ? publicSource : join(root, "candidate");
    if (!isPublic) {
      const original = await realpath(requestedSource === "candidate" ? repository : resolve(requestedSource));
      assert.ok(!under(source, original), "candidate must be outside source ancestry");
      await cp(original, source, { recursive: true, filter: (path) => !path.split(sep).some((part) => part === ".git" || part === "node_modules") });
    }
    const ctx = { root, home, cwd, env, source, public: isPublic, host };
    ctx.version = (await command(hostBins[host], ["--version"], ctx)).trim();
    assert.ok(ctx.version, `${host} version unavailable`);
    if (!isPublic) ctx.expected = await skillNames(source);
    return ctx;
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

async function piCatalog(ctx) {
  return rpc(hostBins.pi, ["--mode", "rpc", "--no-session", "--offline", "--no-extensions", "--no-context-files"], ctx, async (request) => {
    const response = await request({ id: "skills", type: "get_commands" });
    assert.equal(response.success, true, `Pi get_commands failed: ${JSON.stringify(response)}`);
    assert.ok(Array.isArray(response.data?.commands), "Pi malformed command catalog");
    return response.data.commands.filter((entry) => entry.source === "skill");
  });
}

async function piInstall(ctx) {
  if (!ctx.installed) absent((await piCatalog(ctx)).map((entry) => entry.name.replace(/^skill:/u, "")), "Pi");
  await command(hostBins.pi, ["install", ctx.source], ctx);
  const skills = await piCatalog(ctx);
  const packageSkills = skills.filter((entry) => entry.sourceInfo?.origin === "package");
  for (const entry of packageSkills) {
    assert.ok(under(entry.sourceInfo.path, ctx.public ? ctx.home : ctx.source), `Pi skill has unexpected source: ${JSON.stringify(entry)}`);
  }
  assert.ok(packageSkills.length > 0, "Pi did not load package skills");
  const expected = ctx.expected ?? await skillNames(packageSkills[0].sourceInfo.baseDir);
  inventory(packageSkills.map((entry) => entry.name.replace(/^skill:/u, "")), expected, "Pi");
  ctx.installed = true;
}

async function ompCatalog(ctx) {
  // lean-ctx: explicit real-model metadata only; remove when native startup no longer needs a model without credentials.
  const args = ["--mode", "rpc", "--no-session", "--no-rules", "--no-title", "--model", "openai-codex/gpt-6.1-sol"];
  ctx.lastCommand = `${hostBins.omp} ${args.join(" ")} → get_available_commands`;
  const client = startOmpRpc(hostBins.omp, args, { cwd: ctx.cwd, env: ctx.env });
  try {
    const { data } = await client.command({ type: "get_available_commands" });
    assert.ok(Array.isArray(data?.commands), "OMP malformed native command catalog");
    assert.equal(client.frames.some(frame => frame.type === "agent_start"), false, "catalog discovery must not start a model turn");
    return data.commands.filter(entry => entry.source === "skill");
  } finally {
    await client.close();
  }
}

async function ompInstall(ctx) {
  if (!ctx.installed) {
    absent((await ompCatalog(ctx)).map(entry => entry.name.replace(/^skill:/u, "")), "OMP");
    for (const name of requiredSkills) {
      await assert.rejects(command(hostBins.omp, ["read", `skill://${name}`], ctx), /not found|unknown|no .*skill|unable to resolve/iu, `OMP baseline unexpectedly resolves ${name}`);
    }
  }
  await command(hostBins.omp, ctx.public ? ["install", publicSource] : ["plugin", "link", ctx.source], ctx);
  const list = JSON.parse(await command(hostBins.omp, ["plugin", "list", "--json"], ctx));
  const plugin = Object.values(list).flat().find((entry) => entry.name === "pstack-pi");
  assert.equal(plugin?.enabled, true, "OMP installed plugin is not enabled");
  assert.ok(under(plugin.path, ctx.home), `OMP plugin path is not isolated: ${plugin.path}`);
  if (ctx.public) assert.ok(under(await realpath(plugin.path), ctx.home), "OMP public install cannot be a local link");
  const skills = await ompCatalog(ctx);
  inventory(skills.map(entry => entry.name.replace(/^skill:/u, "")), ctx.expected ?? await skillNames(await realpath(plugin.path)), "OMP");
  if (!ctx.public) assert.equal(await realpath(plugin.path), await realpath(ctx.source), "OMP link resolves an older or different package");
  for (const name of [...requiredSkills, "pstack-pi", "orchestrate-omp", "poteto-help"]) {
    const output = await command(hostBins.omp, ["read", `skill://${name}`], ctx);
    assert.match(output, new RegExp(`name: ${name}(?:\\r?\\n|$)`), `OMP failed to load ${name}`);
    assert.ok(output.includes(plugin.path), `OMP did not resolve ${name} through the installed plugin`);
  }
  ctx.installed = true;
}

async function opencodeInstall(ctx, global) {
  const catalog = async () => {
    const result = JSON.parse(await command(hostBins.opencode, ["debug", "skill"], ctx, true));
    assert.ok(Array.isArray(result), "OpenCode malformed skill catalog");
    return result;
  };
  if (!ctx.installed) absent((await catalog()).map((entry) => entry.name), "OpenCode");
  if (ctx.public) {
    if (!ctx.checkout) {
      ctx.checkout = join(global ? ctx.home : ctx.cwd, global ? ".local/share/oh-my-pstack" : ".pstack-source");
      await command("git", ["clone", `${publicSource}.git`, ctx.checkout], ctx);
    } else await command("git", ["-C", ctx.checkout, "pull", "--ff-only"], ctx);
  }
  const source = ctx.checkout ?? ctx.source;
  const skillsDir = global ? join(ctx.home, ".config", "opencode", "skills") : join(ctx.cwd, ".opencode", "skills");
  await mkdir(skillsDir, { recursive: true });
  await cp(join(source, "skills"), skillsDir, { recursive: true });
  const skills = (await catalog()).filter((entry) => under(entry.location, skillsDir));
  inventory(skills.map((entry) => entry.name), ctx.expected ?? await skillNames(source), "OpenCode");
  ctx.installed = true;
}

async function claudeInstall(ctx) {
  const installed = async () => JSON.parse(await command(hostBins.claude, ["plugin", "list", "--json"], ctx));
  if (!ctx.installed) assert.ok(!(await installed()).some((entry) => entry.id === "pstack-pi@oh-my-pstack"), "Claude baseline already contains pstack");
  await command(hostBins.claude, ["plugin", "marketplace", "add", ctx.public ? "JonathanPitre/oh-my-pstack" : ctx.source], ctx);
  await command(hostBins.claude, ["plugin", "install", "pstack-pi@oh-my-pstack"], ctx);
  const plugin = (await installed()).find((entry) => entry.id === "pstack-pi@oh-my-pstack");
  assert.equal(plugin?.enabled, true, "Claude installed plugin is not enabled");
  assert.ok(under(plugin.installPath, ctx.home), `Claude install path is not isolated: ${plugin.installPath}`);
  const details = await command(hostBins.claude, ["plugin", "details", "pstack-pi"], ctx);
  const row = details.match(/^\s+Skills \(\d+\)\s+(.+)$/mu);
  assert.ok(row, "Claude component inventory missing skills");
  inventory(row[1].split(/,\s*/u), ctx.expected ?? await skillNames(plugin.installPath), "Claude Code");
  ctx.installed = true;
}

async function codexCatalog(ctx) {
  return rpc(hostBins.codex, ["app-server", "--listen", "stdio://"], ctx, async (request, notify) => {
    const initialized = await request({ id: 1, method: "initialize", params: { clientInfo: { name: "pstack-install-check", title: "pstack install check", version: "1.0.0" }, capabilities: null } });
    assert.ok(!initialized.error, `Codex initialize failed: ${JSON.stringify(initialized)}`);
    notify({ method: "initialized", params: {} });
    const result = await request({ id: 2, method: "skills/list", params: { cwds: [ctx.cwd], forceReload: true } });
    assert.ok(!result.error, `Codex skills/list failed: ${JSON.stringify(result)}`);
    assert.ok(Array.isArray(result.result?.data), "Codex malformed skill catalog");
    const errors = result.result.data.flatMap((group) => group.errors);
    assert.deepEqual(errors.filter((error) => /pstack/iu.test(JSON.stringify(error))), [], "Codex reported pstack skill errors");
    return result.result.data.flatMap((group) => group.skills);
  });
}

async function codexInstall(ctx) {
  if (!ctx.installed) absent((await codexCatalog(ctx)).map((entry) => entry.name.split(":").at(-1)), "Codex");
  await command(hostBins.codex, ["plugin", "marketplace", "add", ctx.public ? "JonathanPitre/oh-my-pstack" : ctx.source], ctx);
  await command(hostBins.codex, ["plugin", "add", "pstack-pi@oh-my-pstack"], ctx);
  const list = JSON.parse(await command(hostBins.codex, ["plugin", "list", "--json"], ctx));
  const plugin = list.installed.find((entry) => entry.pluginId === "pstack-pi@oh-my-pstack");
  assert.equal(plugin?.installed, true, "Codex package not installed");
  assert.equal(plugin.enabled, true, "Codex package disabled");
  const skills = (await codexCatalog(ctx)).filter((entry) => entry.pluginId === plugin.pluginId);
  for (const skill of skills) {
    assert.equal(skill.enabled, true, `Codex ${skill.name} disabled`);
    assert.ok(under(skill.path, ctx.home), `Codex skill path is not isolated: ${skill.path}`);
  }
  assert.ok(skills.length > 0, "Codex installed plugin has no skills");
  const expected = ctx.expected ?? await skillNames(resolve(dirname(skills[0].path), "../.."));
  inventory(skills.map((entry) => entry.name.split(":").at(-1)), expected, "Codex");
  ctx.installed = true;
}

function geminiCatalog(output) {
  return [...output.matchAll(/^([\w-]+) \[(Enabled|Disabled)\]\r?\n\s+Description: [^\n]*\r?\n\s+Location:\s+([^\r\n]+)/gmu)]
    .map((match) => ({ name: match[1], enabled: match[2] === "Enabled", path: match[3] }));
}

async function geminiInstall(ctx) {
  const catalog = async () => geminiCatalog(await command(hostBins.gemini, ["skills", "list", "--all"], ctx));
  if (!ctx.installed) absent((await catalog()).map((entry) => entry.name), "Gemini");
  await command(hostBins.gemini, ["skills", "install", ctx.public ? publicSource : join(ctx.source, "skills"), "--scope", "user", ...(ctx.public ? ["--path", "skills"] : []), "--consent"], ctx);
  const root = join(ctx.home, ".gemini");
  const skills = (await catalog()).filter((entry) => under(entry.path, root));
  for (const skill of skills) assert.equal(skill.enabled, true, `Gemini ${skill.name} disabled`);
  inventory(skills.map((entry) => entry.name), ctx.expected ?? await skillNames(root), "Gemini");
  ctx.installed = true;
}

const cases = [["OMP", "omp", ompInstall], ["Pi", "pi", piInstall], ["OpenCode global", "opencode", (ctx) => opencodeInstall(ctx, true)], ["OpenCode project", "opencode", (ctx) => opencodeInstall(ctx, false)], ["Claude Code", "claude", claudeInstall], ["Codex", "codex", codexInstall], ["Gemini", "gemini", geminiInstall]];

test("real host installation leaves live agent configuration unchanged", async (t) => {
  const snapshots = new Map(await Promise.all(livePaths.map(async (path) => [path, await snapshot(path)])));
  try {
    // Resolve PATH entries once, before any child receives its disposable HOME.
    for (const host of selectedHosts) {
      if (!isAbsolute(hostBins[host])) {
        try { hostBins[host] = (await execFileAsync("which", [hostBins[host]])).stdout.trim(); }
        catch (error) { hostBins[host] = resolve(hostBins[host]); }
      }
    }
    for (const [name, host, install] of cases) {
      if (!selectedHosts.has(host)) continue;
      await t.test(name, async (subtest) => {
        const ctx = await setup(host);
        subtest.diagnostic(`${name}: ${ctx.version}; executable=${hostBins[host]}; source=${ctx.public ? publicSource : requestedSource === "candidate" ? "isolated candidate" : requestedSource}`);
        try { await install(ctx); await install(ctx); }
        catch (error) { throw new Error(`${name} ${ctx.version} (${hostBins[host]}): ${error.message}\nLast command: ${ctx.lastCommand}`, { cause: error }); }
        finally { await rm(ctx.root, { recursive: true, force: true }); }
      });
    }
  } finally {
    for (const [path, bytes] of snapshots) {
      const current = await snapshot(path);
      assert.ok(bytes === null ? current === null : current?.equals(bytes), `live configuration changed: ${path}`);
    }
  }
});
