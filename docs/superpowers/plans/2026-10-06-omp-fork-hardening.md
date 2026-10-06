# Oh My Pi Fork Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user must review this plan and choose the execution method before product changes.

**Goal:** Ship a reliable OMP-first fork with safe reviewed synchronization, independent releases, demonstrable workflow behavior, and concise onboarding.

**Architecture:** Keep the existing router, host adapter, updater, verifier, and install harness. Add only narrow artifact/RPC checks, preserve other hosts, and separate unprivileged candidate execution from privileged proposal creation.

**Tech Stack:** Existing Node ESM and Node test runner, Git, Bun, TypeScript, npm, OMP CLI/RPC, Markdown, GitHub Actions; no new product dependency.

**Spec:** [Approved hardening specification](../specs/2026-10-06-omp-fork-hardening-design.md).

## Global Constraints

- Cursor content baseline: `77526ffa67f8dafc698d14b5356e6d4fc78c3127`, version `0.15.13`.
- Fork release version: `0.15.13-omp.1`; preserve the package identity `pstack-pi`. The base identifies Cursor lineage, while omp revisions permit independent fork fixes.
- This is a SemVer prerelease channel: publish with `--tag omp` and use `pstack-pi@omp` in npm examples after publication, never advertise an unverified stable latest release.
- Source version belongs in `upstream.lock.json.version`; fork manifests agree with each other, not necessarily with Cursor.
- Preserve native Pi, OpenCode, Claude Code, Codex, and Gemini support.
- Never execute candidate code with repository write credentials; scheduled updates propose but never automatically merge.
- No publication, tagging, PR submission by the executor, or updates to live installed plugins.
- Preserve the user's existing README/package edits and untracked publishing workflow. Commit only explicitly owned changes.
- No new runtime extension, alternate importer, recipe DSL, provider runner, telemetry, retry layer, or transaction journal.
- Existing checks passed: 77 Node tests, 52 Bun tests, strict TypeScript, and seven isolated host-install paths (eight Node tests including the parent).
- Root has verified OMP 18.6.1 RPC command discovery: `get_available_commands` returns `{ commands }`, skill names are `skill:<name>`, and `source` is `skill`.
- OMP prompt acknowledgement is not completion; correlate `prompt_result.id` and wait for `session_settled` when `sessionSettled` is false.
- Root also verified the documented `openai-codex/gpt-6.1-sol:low` selector through RPC get_state: provider/model remained unchanged and thinkingLevel was low. A missing effort field does not imply no reasoning support.
- Baseline installation/catalog calls made no model requests. Authenticated smoke must explicitly select an available model and never print credentials.
- Language-server references were attempted for the updater; no server handles these `.mjs` files. Text search found version-helper callers only in updater/tests.

## Review Focus

1. Unchanged bytes with an executable-mode transition must synchronize without granting unrelated read/write permissions; Task 1 pins this.
2. A review path whose parent resolves inside the destination must fail without changing a sentinel or managed files; Task 2 pins this.
3. Reviewed replay after a source-version change must distinguish the complete final lock from stale/mixed metadata; Task 3 pins this.
4. An installed reference that exists in the checkout but escapes the shipped skill tree must fail validation; Task 4 pins this.
5. A prompt that yields with background work pending must not be called finished, and a successful acknowledgement followed by provider failure must fail the smoke; Task 5 pins this.

## File Structure and Ownership

| Files | Responsibility |
| --- | --- |
| `scripts/sync-upstream.mjs`, `scripts/sync-upstream.test.mjs` | Existing reconciliation, export safety, source-version metadata, and regressions. Tasks 1–3 share these files and run sequentially under one integration owner. |
| `scripts/verify.mjs`, `scripts/verify.test.mjs` | Shipped-reference, metadata, and version validation. |
| `scripts/package.test.mjs` (new) | Real npm tarball extraction and verification in temporary state. |
| `scripts/omp-rpc.mjs`, `scripts/omp-rpc.test.mjs` (new) | Small OMP-native transport/completion boundary, not a runtime adapter framework. |
| `scripts/install.test.mjs` | Existing host installs, OMP full catalog/source checks, and host selection. |
| `scripts/omp-smoke.mjs` (new) | Separately invoked authenticated OMP scenarios and bounded evidence. |
| `skills/pstack-pi/SKILL.md`, `skills/pstack-pi/references/runtime.md`, `skills/setup-pstack/SKILL.md`, `skills/poteto-help/SKILL.md` | Canonical live-host binding and accurate OMP setup/help. |
| `skills/poteto-mode/playbooks/orchestrate.md`, `skills/poteto-mode/playbooks/autopilot-stack.md`, `skills/poteto-mode/references/plan.md` | Lifecycle/scheduling callers aligned with the adapter. |
| `.github/workflows/upstream-sync.yml`, `.github/workflows/ci.yml` (new), `.github/workflows/publish-npm.yml`, `scripts/sync-proposal.mjs`, `scripts/sync-proposal.test.mjs` (new) | Credential boundaries, bounded proposal intake, deterministic CI, and release-artifact gate. |
| `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `upstream.lock.json` | Scripts, distribution allowlist, fork/source versions, protected adaptations. |
| `README.md`, `docs/installation.md`, `docs/maintenance.md`, `CHANGES.md` (last three new), `THIRD_PARTY_NOTICES.md` | Consumer onboarding, maintainers' procedure, release/ownership record, applicable attribution. |

No worker owns unrelated user files. The integration owner owns cross-task edits to package.json, the lock, and common verification commands.

## Task 1: Preserve applicable executable modes

**Files:** Modify `scripts/sync-upstream.mjs:317-355,459-483`; test in `scripts/sync-upstream.test.mjs` using existing `versionFixture` at 1076.

**Interfaces:** Consume existing `{ content, mode }` states and `{ path, content, sourceMode }` operations. Keep operation shape and CLI exits. Produce accurate operations for upstream-owned mode-only changes without changing adapted-file local-mode protection.

- [ ] Add `lstat` to the test imports and append this consumer-visible regression:

```js
test("mode-only upstream changes preserve target permission boundaries", async () => {
  await versionFixture(async ({ source, target, git, cli }) => {
    const rel = "skills/managed/SKILL.md";
    await chmod(join(target, rel), 0o640);
    await chmod(join(source, "pstack", rel), 0o755);
    git("add", "."); git("commit", "-qm", "make managed file executable");
    const result = cli("--apply");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(target, rel), "utf8"), "baseline\n");
    assert.equal((await lstat(join(target, rel))).mode & 0o777, 0o750);
    assert.equal(JSON.parse(await readFile(join(target, "upstream.lock.json"))).commit, git("rev-parse", "HEAD"));
  });
});
```

- [ ] Run `node --test --test-name-pattern='mode-only' scripts/sync-upstream.test.mjs`; require failure on the old implementation. Add the reverse transition, same-pin repair, and protected local-mode retention with explicit byte/mode assertions using the same fixture.
- [ ] Make suppression compare the applicable desired mode as well as content. Use this core decision inside `reconcilePath`, retaining protected-path rules:

```js
const operation = (content) => {
  const modeDiffers = content !== null && sourceMode !== null && local?.mode !== sourceMode;
  return content === localContent && !modeDiffers ? null : { path, content, sourceMode };
};
```

For ordinary paths, derive `outcome.kind` from whether an operation exists. Use complete applicable state in reviewed operations/final reconstruction too; do not mark a mode-only change as keep when replay should expect a new mode.
- [ ] Apply only execute-bit transitions, preserving the target's other permission bits and creation umask:

```js
const permissions = (await lstat(path)).mode & 0o777;
const nextPermissions = operation.sourceMode === "100755"
  ? permissions | 0o100 | ((permissions & 0o444) >> 2)
  : permissions & ~0o111;
await chmod(path, nextPermissions);
```

Owner execute is the minimum required to represent Git's executable state even for a write-only local file. Add a 0220-to-0320 regression: never grant read/write permissions merely to make the mode match.

- [ ] Run the affected updater regression suite and an actual fixture CLI apply; inspect bytes, mode, and lock rather than success text. Commit only this unit with `fix(sync): preserve applicable executable modes`.

## Task 2: Own fresh review-export directories safely

**Files:** Modify `scripts/sync-upstream.mjs:105-113,202-231,498-544`; tests beside existing `reviewFixture` at 699.

**Interfaces:** Keep `--export-review DIR`; DIR is now a new child of an existing parent. Existing populated or empty DIR is rejected. Review application still reads an existing review. No compatibility alias for unsafe reuse.

- [ ] Add this failing regression, reusing the existing fixture without changing its API:

```js
test("review export refuses an existing manifest symlink without mutation", async () => {
  await reviewFixture(async ({ directory, review, cli, untouched }) => {
    const sentinel = join(directory, "sentinel");
    await writeFile(sentinel, "keep sentinel\n");
    await mkdir(review);
    await symlink(sentinel, join(review, "manifest.json"));
    const result = cli("--export-review", review);
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(sentinel, "utf8"), "keep sentinel\n");
    await untouched();
  });
});
```

- [ ] Add cases for an empty pre-existing directory, symlinked `entries`, and a symlinked parent directing the fresh leaf inside target. The latter passes `join(alias, "review")`, where alias points to target, and asserts no review child was created there. Run these against old code and observe failure before fixing.
- [ ] Import `realpath` and `basename`. Resolve the parent canonically, compare against `await realpath(root)`, and require a fresh export leaf. Keep existing regular-directory checks for review reads. The write boundary is:

```js
const leaf = resolve(reviewDir);
const parent = await realpath(dirname(leaf));
const reviewRoot = join(parent, basename(leaf));
const destinationRoot = await realpath(root);
if (reviewRoot === destinationRoot || reviewRoot.startsWith(`${destinationRoot}${sep}`)) {
  throw new Error("Review path resolves inside destination");
}
await mkdir(reviewRoot, { mode: 0o700 });
await mkdir(join(reviewRoot, "entries"), { mode: 0o700 });
```

Retain nonrecursive exclusive creation for entry directories. Write snapshots, proposals, and manifest with `{ flag: "wx", mode: 0o600 }`; null snapshots create nothing. Refuse unsafe read subdirectories before consuming decisions. Do not unlink or overwrite a reused export tree.
- [ ] Delete the existing wording-only `review substitute diagnostic names export-review for unresolved apply` test; retain real conflict/no-write behavior tests. Do not re-pin diagnostic prose.
- [ ] Run the complete updater suite and a real export/resolve/dry-run/apply/replay fixture. Explain that callers must use a fresh leaf, not an already-created `mktemp -d` root. Commit `fix(sync): isolate fresh review exports`.

## Task 3: Separate fork releases from Cursor provenance

**Files:** Modify updater/version tests, `upstream.lock.json`, package/plugin manifests, and version checks in `scripts/verify.mjs:173-176,223-233`.

**Interfaces:** Lock adds required `version: string` containing Cursor's SemVer at `commit`. Keep `readUpstreamPluginVersion(lock, sourceRoot, commit)`. Remove exported `PORTABLE_VERSION_PATHS` and its callers; replace mirroring logic with a private fork-manifest validation list. No obsolete alias/re-export.

- [ ] Replace the mirroring regression with byte-preservation assertions. In the existing source bump fixture, seed fork manifests at 9.0.0, keep their exact buffers, apply upstream 1.2.4, and assert:

```js
for (const rel of ["package.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
  assert.deepEqual(await readFile(join(target, rel)), before.get(rel));
}
const current = JSON.parse(await readFile(join(target, "upstream.lock.json")));
assert.equal(current.commit, latest);
assert.equal(current.version, "1.2.4");
```

Define `before` as a Map of those buffers in that test; `latest` is its existing incoming Git SHA. Migrate every fixture lock to the correct baseline source version. Add source metadata repair on the same pin, fork-manifest mismatch rejection, SemVer boundary cases, and reviewed replay with changed version/mixed metadata.
- [ ] Run the replacement tests and observe old code changing fork versions. Do not retain tests whose sole contract is the removed mirroring behavior.
- [ ] Keep a strict SemVer check in upstream parsing and fork validation. Accept `1.2.3`, `1.2.3-rc.1+build.7`; reject `01.2.3`, `1.2.3-01`, empty strings, and `not-semver` before managed writes. Use this pattern in the existing files rather than add a dependency:

```js
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
```

Read all three local manifests before any apply and require matching valid fork versions; never write them from sync. Replace version writes with the pin-last lock write:

```js
const upstreamVersion = readUpstreamPluginVersion(lock, sourceRoot, commit);
const nextLock = { ...lock, commit, version: upstreamVersion };
```

Perform fork validation before existing operation writes and rename this complete lock last. Keep dry-run no-write.
- [ ] Exclude commit/version from ownership-policy comparison in `lockConfig`, but check both for original/final reviewed state. A final replay requires the recomputed incoming source version, not merely a matching commit. Reject mixed metadata; do not silently repair a stale reviewed artifact. Ordinary apply may repair same-pin source metadata.
- [ ] `--check` returns 10 for a newer source revision or incorrect recorded source version, 0 for an exact current source record, and a nonzero error for invalid fork metadata; it no longer considers a legitimate independent fork version upstream drift.
- [ ] Record lock version 0.15.13 and set all fork version surfaces to 0.15.13-omp.1 without discarding unrelated manifest fields. Verify the actual prerelease format is accepted, while source sync leaves the fork version untouched. Replace the now-obsolete manifest-write-failure regression with a managed-write failure that proves the source pin/version remain unchanged.
- [ ] Run updater/verifier suites and fixture check/apply/replay. Commit `feat(release): decouple fork and upstream versions`.

## Task 4: Verify shipped references and the real npm artifact

**Files:** Modify `scripts/verify.mjs`, `scripts/verify.test.mjs`; create `scripts/package.test.mjs`; integration owner updates package scripts/files.

**Interfaces:** Preserve `npm run verify` and its nonzero failure contract. Add `npm run test:package` = `node --test scripts/package.test.mjs`. Skill-relative local references are confined to the skills tree; README/shipped documentation references are confined to the package. Existing external upstream guides stay external links.

- [ ] Factor the verifier-test fixture setup locally into withVerifyFixture(run), using the existing cp/repository imports and adding access. Copy the complete shipped fixture inputs, excluding dependency directories and planning history:

```js
async function withVerifyFixture(run) {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-verify-"));
  try {
    const required = ["skills", "README.md", "package.json", "scripts/verify.mjs", ".claude-plugin", ".codex-plugin", ".agents", "upstream.lock.json", "docs/upstream-compatibility-design.md", "assets", "agents", "LICENSE", "THIRD_PARTY_NOTICES.md"];
    for (const path of required) {
      await cp(join(repository, path), join(fixture, path), {
        recursive: true, filter: source => !source.split("/").includes("node_modules"),
      });
    }
    for (const path of ["docs/installation.md", "docs/maintenance.md", "CHANGES.md"]) {
      try { await access(join(repository, path)); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      await cp(join(repository, path), join(fixture, path));
    }
    return await run(fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}
```

The optional files do not exist until Task 7; once present, the verifier must require them if they are referenced. Migrate the existing URI cases to this helper without re-pinning diagnostic wording.
- [ ] Add behavioral rejection tests for existing outside-target files, encoded traversal, symlink escape, absent shipped targets, and a root README link to an omitted documentation file. Example:

```js
test("verify rejects a resource symlink escaping the skill tree", async () => {
  await withVerifyFixture(async (fixture) => {
    await writeFile(join(fixture, "outside.md"), "outside\n");
    await symlink(join(fixture, "outside.md"), join(fixture, "skills/poteto-mode/escaped.md"));
    await writeFile(join(fixture, "skills/poteto-mode/uri-fixture.md"), "Read `skill://poteto-mode/escaped.md`.\n");
    const result = spawnSync(process.execPath, [join(fixture, "scripts/verify.mjs")], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
  });
});
```

Add the same containment boundary for inline and reference-style Markdown links. Run before the implementation to observe the current symlink acceptance.
- [ ] Reuse the current scanner, decode targets before resolution, and check lexical and canonical containment plus file existence. Do not import a Markdown parser or validate instruction wording. Apply the skills-tree boundary to links from skills; apply package boundary to README and the deliberately shipped documentation. Account for the current README's HTML logo source. Fix poteto-help's root README link to the fork's public README so skills-only installs work.

```js
const suffix = relative(boundary, targetPath);
if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`)) throw new Error("escaping reference");
const canonicalBoundary = await realpath(boundary);
const canonicalTarget = await realpath(targetPath);
const canonicalSuffix = relative(canonicalBoundary, canonicalTarget);
if (isAbsolute(canonicalSuffix) || canonicalSuffix === ".." || canonicalSuffix.startsWith(`..${sep}`)) throw new Error("symlink escape");
if (!(await stat(canonicalTarget)).isFile()) throw new Error("reference is not a file");
```

- [ ] Build the package test around real npm/tar commands, not a mock packlist:

```js
const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
  cwd: repository, encoding: "utf8", env: { ...process.env, npm_config_cache: join(directory, "cache") },
}));
execFileSync("tar", ["-xzf", join(directory, packed[0].filename), "-C", directory]);
const installed = join(directory, "package");
execFileSync(process.execPath, [join(installed, "scripts/verify.mjs")], { cwd: installed });
```

Wrap this in a Node test with mkdtemp/finally cleanup. Compare complete source/package skill inventories and verify the required manifests, notices, assets, and resources through the extracted verifier. Do not add source-versus-copy byte-equality assertions as behavioral tests. Then remove a required extracted resource and require the real verifier to fail; this demonstrates that a missing installed resource is caught.
- [ ] Add the existing linked technical reference docs/upstream-compatibility-design.md to the files allowlist now; Task 7 adds its new documents when they exist. Do not ship docs/superpowers history merely to satisfy a README link.
- [ ] Run verifier/pack tests and inspect the extracted artifact. Commit `test(package): verify shipped references and artifacts`.

## Task 5: Exercise OMP-native discovery and live workflow behavior

**Files:** Create `scripts/omp-rpc.mjs`, `scripts/omp-rpc.test.mjs`, `scripts/omp-smoke.mjs`; modify install tests and listed OMP setup/help/runtime/lifecycle skills; integration owner adds `test:omp-rpc` and `smoke:omp` scripts.

**Interfaces:** `startOmpRpc(bin, args, { cwd, env, timeoutMs, answerUi })` returns `{ command(message), prompt(message), frames, close() }`. command assigns an id and resolves the matching success response; prompt resolves only its matching successful prompt_result followed by settled state (or synchronous local completion). Failures/timeouts/closed process reject pending work. frames records bounded observable events; close terminates and awaits owned process cleanup. This is a test-only native transport, not a new model/runtime abstraction.

- [ ] Add deterministic protocol-transition tests for acknowledgement followed by provider failure, yield-before-settlement, unrelated/stale prompt ids, malformed frames, and child exit. Feed newline frames through a small temporary Node child that emits the chosen sequence; assert pending/completed/error transitions, not echoed payloads. Define the fixture child in the test file and clean it up. These tests exercise the actual transport's consumption and completion behavior, not a fake OMP implementation used as product evidence.

Use this concrete settlement test; import the existing Node test/assert/fs/path helpers and the new startOmpRpc:

```js
test("prompt remains pending after yield until native settlement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "omp-rpc-transition-"));
  let rpc;
  try {
    const executable = join(directory, "frames.mjs");
    await writeFile(executable, `
      import { createInterface } from "node:readline";
      const emit = frame => process.stdout.write(JSON.stringify(frame) + "\\n");
      createInterface({ input: process.stdin }).on("line", line => {
        const request = JSON.parse(line);
        emit({ type: "response", id: request.id, command: request.type, success: true, data: {} });
        if (request.type === "prompt") {
          emit({ type: "agent_end", yielded: true });
          emit({ type: "prompt_result", id: request.id, status: "completed", sessionSettled: false });
        }
        if (request.type === "release") emit({ type: "session_settled" });
      });
    `);
    rpc = await startOmpRpc(process.execPath, [executable], { cwd: directory, env: process.env, timeoutMs: 5000 });
    let completed = false;
    const result = rpc.prompt({ type: "prompt", message: "fixture" }).then(value => { completed = true; return value; });
    await rpc.command({ type: "get_state" });
    assert.equal(completed, false);
    await rpc.command({ type: "release" });
    assert.equal((await result).status, "completed");
  } finally {
    await rpc?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
```

The get_state response is a deterministic ordering barrier, not an asserted mock payload. Add a provider-error variant by emitting status:error after a successful prompt acknowledgement and requiring prompt rejection. Run these before implementing completion handling.
- [ ] Implement native line framing using readline over spawned stdout, with request ids and waiters registered before stdin writes. The completion decision is:

```js
let resultForId = null;
let awaitingSettlement = false;
if (frame.type === "prompt_result" && frame.id === id) {
  resultForId = frame;
  if (frame.status !== "completed") reject(new Error(`OMP prompt ${frame.status}`));
  else if (frame.sessionSettled) resolve(frame);
  else awaitingSettlement = true;
}
if (frame.type === "session_settled" && awaitingSettlement) resolve(resultForId);
```

Keep resultForId only for the matching prompt; handle local `response.data.agentInvoked === false` as completion. A successful prompt response alone never resolves model-backed work. Bound framing/evidence and execution time, report overflow rather than silently trim proof, and reject waiters on exit. Use one watchdog and deterministic close, not retries/polling.
- [ ] Confirm get_available_commands using a real credential-free OMP process. Replace OMP's two-skill-only check with catalog inventory:

```js
const { data } = await rpc.command({ type: "get_available_commands" });
const actual = data.commands.filter(entry => entry.source === "skill").map(entry => entry.name.replace(/^skill:/u, ""));
inventory(actual, ctx.expected, "OMP");
```

Keep actual resource reads/source-path checks, including pstack-pi, orchestrate-omp, and poteto-help. Filter selected installation cases with validated `PSTACK_INSTALL_HOSTS` keys; absent selection keeps all hosts. Run `PSTACK_INSTALL_HOSTS=omp npm run test:install` with a real binary; assert unchanged live configuration. Do not replace Pi's get_commands with OMP's incompatible dialect.
- [ ] Write explicit OMP setup/help rules using the canonical contract. State that OMP uses the live task schema, `.pstack/config.md`, available agent mapping, and verified model selectors; Pi-only installation/settings remain conditional. Preserve documented thinking-selector syntax when the selected model supports its level, and verify the applied level through native state/child evidence. Do not equate an absent effort field with absent reasoning support or fabricate provider model-ID variants. Replace Cursor-only help commands and Custom Mode promises with OMP invocation/discovery. In lifecycle callers, delegate scheduling availability to the adapter and record a checkpoint when no scheduler exists. Extend protected ownership to the newly adapted poteto-help path. Do not add source-text tests for these instructions.
- [ ] Implement smoke preflight in the new script: require PSTACK_OMP_MODEL, query `omp models find <model-id> --json --no-extensions`, and require an exact provider/model match in the returned inventory. Preserve a documented thinking suffix only after validating its supported level; reject an unknown suffix instead of changing the provider model ID. Confirm the applied thinking level through native state. Source credential may be supplied as PSTACK_OMP_API_KEY; otherwise capture `omp token <provider>` privately with native auth in the original environment. Never show token command stdout or include it in errors. Use only this provider's credential in the disposable child environment; do not copy the vault or pass tokens on command-line arguments.

Use OMP's supported isolated models.yml credential reference:

```js
const envAllowlist = ["PATH", "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "GIT_SSL_CAINFO"];
const safeEnvironment = Object.fromEntries(envAllowlist.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
await writeFile(join(agentDir, "models.yml"), `providers:\n  ${JSON.stringify(model.provider)}:\n    apiKey: PSTACK_OMP_SMOKE_TOKEN\n`, { mode: 0o600 });
const childEnv = {
  ...safeEnvironment, HOME: home, PI_CODING_AGENT_DIR: agentDir,
  XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"),
  XDG_CACHE_HOME: join(home, ".cache"), XDG_STATE_HOME: join(home, ".local/state"),
  TMPDIR: join(home, "tmp"), PSTACK_OMP_SMOKE_TOKEN: credential,
};
```

safeEnvironment is the install harness's non-secret process/proxy/certificate allowlist. Reject empty credentials before launch; OMP otherwise treats an unset apiKey variable name as a literal token. No automatic fallback to another model/provider. Use the original auth command only for normal supported credential resolution, never login/logout or account configuration.
- [ ] Run real OMP with the candidate package in isolated state using `--mode rpc-ui --no-ui --no-session --no-extensions --no-rules --no-title --plugin-dir <candidate> --model <confirmed-selector> --config <overlay>`. Create the home/agent/temp directories before launch. Seed this disposable overlay; the hidden effort field remains unsupported, while supported thinking selectors must still work:

```js
const overlay = join(home, "omp-smoke.yml");
await writeFile(overlay, JSON.stringify({
  task: { enableEffort: false, disabledAgents: ["designer", "librarian"] },
}), { mode: 0o600 });
```

Native docs confirm these settings; do not modify live settings.

The UI responder answers only fixture setup/model questions and confirmations scoped to the disposable project, using exact labels/custom inputs from the request; unknown dialogs fail rather than blindly approve. Enable native ask-dialog RPC delivery with `set_ask_dialog`. Prompts explicitly give the desired disposable settings/model choices so tests do not ask the human to configure anything.
- [ ] Exercise these fixed scenarios and inspect resulting state/tool events:
  - `/skill:poteto-help`: ask for OMP setup, then execute the advised skill/resource-loading path; commands must exist in the real catalog, without asserting exact prose.
  - `/skill:setup-pstack`: assign the confirmed model in the disposable project, preserve an existing unrelated config line, and verify no `.pi/settings.json` appears.
  - Repeat with a deliberately unavailable selector and a seeded reasoning value `fixture-unsupported`; require rejection/reporting before invalid dispatch, preserve valid settings, and explicitly exercise an inventory-supported thinking level through documented selector syntax. Do not claim that hiding the effort field disables this supported path.
  - `/skill:poteto-mode`: investigate a tiny read-only fixture using canonical planner/research roles while designer/librarian are disabled; require real task events using available mappings and full child-result consumption.
  - Use a finite asynchronous task to prove prompt settlement and lifecycle handling; asking about an hourly audit must not create an unsupported scheduler or assert that an old agent id revives a session.

Store only non-secret evidence under a temporary directory, emit a compact scenario/model/runtime/source summary, inspect traces before cleanup, and await every owned child. Model-response prose alone is never the success assertion.
- [ ] Run deterministic transport tests and OMP-only installation before the authenticated scenarios. Confirm catalog/source identity and no live settings changes. Commit `fix(omp): verify native setup and workflow behavior` only after the actual paths work.

## Task 6: Separate candidate validation from privileged proposals

**Files:** Modify upstream-sync and existing user publish workflow; create ci.yml, `scripts/sync-proposal.mjs`, and its Node tests. Consume Tasks 3–5 script interfaces.

**Interfaces:** Candidate job emits only `proposal.patch` and `metadata.json` containing `{ base, sourceCommit, sourceVersion, patchSha256 }`. `sync-proposal.mjs <artifact-directory> <expected-base>` validates/apply-stages a bounded proposal in a trusted checkout, never executes candidate code, and exits nonzero for unsafe input. It accepts only skills paths and upstream.lock.json; no package/manifest version mirroring remains.

- [ ] Add real Git fixtures proving valid patch application, out-of-scope and normalized-traversal path rejection, symlink/submodule mode rejection, corrupt digest rejection, wrong base rejection, and mismatched source metadata. Assert no outside sentinel changes and no accepted proposal on errors. Do not test workflow YAML via source substrings.

Define the real fixture in sync-proposal.test.mjs with the Node fs/crypto/child_process imports used elsewhere:

```js
async function proposalFixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "pstack-proposal-"));
  const target = join(directory, "target"), artifact = join(directory, "artifact");
  const git = (...args) => execFileSync("git", args, { cwd: target, encoding: "utf8" }).trim();
  try {
    await mkdir(join(target, "skills/example"), { recursive: true });
    await mkdir(artifact);
    const lock = {
      repository: "https://github.com/cursor/plugins.git", ref: "main", path: "pstack",
      commit: "77526ffa67f8dafc698d14b5356e6d4fc78c3127", version: "0.15.13",
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      protectedPaths: [], protectedPrefixes: [],
    };
    await writeFile(join(target, "upstream.lock.json"), JSON.stringify(lock));
    await writeFile(join(target, "skills/example/data.txt"), "base\n");
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Proposal test"); git("config", "user.email", "proposal@example.invalid");
    git("add", "."); git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    const next = { ...lock, commit: "a".repeat(40), version: "0.15.14" };
    await writeFile(join(target, "upstream.lock.json"), JSON.stringify(next));
    await writeFile(join(target, "skills/example/data.txt"), "incoming\n");
    const patch = execFileSync("git", ["diff", "--no-renames", "--binary", "HEAD"], { cwd: target, encoding: "utf8" });
    await writeFile(join(target, "upstream.lock.json"), JSON.stringify(lock));
    await writeFile(join(target, "skills/example/data.txt"), "base\n");
    const metadata = { base, sourceCommit: next.commit, sourceVersion: next.version, patchSha256: createHash("sha256").update(patch).digest("hex") };
    await writeFile(join(artifact, "proposal.patch"), patch);
    await writeFile(join(artifact, "metadata.json"), JSON.stringify(metadata));
    const cli = () => spawnSync(process.execPath, [new URL("./sync-proposal.mjs", import.meta.url).pathname, artifact, base], { cwd: target, encoding: "utf8" });
    await run({ directory, target, artifact, metadata, patch, cli, git });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("proposal accepts only the bounded patch and exact metadata", async () => {
  await proposalFixture(async ({ target, metadata, cli }) => {
    const result = cli();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(target, "skills/example/data.txt"), "utf8"), "incoming\n");
    const actual = JSON.parse(await readFile(join(target, "upstream.lock.json")));
    assert.equal(actual.commit, metadata.sourceCommit);
    assert.equal(actual.version, metadata.sourceVersion);
  });
});

test("proposal rejects an out-of-scope patch before touching a sentinel", async () => {
  await proposalFixture(async ({ directory, target, artifact, metadata, patch, cli }) => {
    const sentinel = join(directory, "sentinel");
    await writeFile(sentinel, "keep\n");
    const unsafe = patch.replaceAll("skills/example/data.txt", "../sentinel");
    metadata.patchSha256 = createHash("sha256").update(unsafe).digest("hex");
    await writeFile(join(artifact, "proposal.patch"), unsafe);
    await writeFile(join(artifact, "metadata.json"), JSON.stringify(metadata));
    assert.notEqual(cli().status, 0);
    assert.equal(await readFile(sentinel, "utf8"), "keep\n");
    assert.equal(await readFile(join(target, "skills/example/data.txt"), "utf8"), "base\n");
  });
});
```

Require the valid fixture to fail before implementation; rejection tests alone can pass when a script is missing. Add the remaining invalid mode/digest/base/metadata cases by mutating this real fixture and asserting the affected state remains unchanged.
- [ ] Implement intake with trusted Node/Git only: compare HEAD/metadata base with expected base, hash the patch, parse git apply --numstat -z paths into a changedPaths set, require canonical relative allowed paths, and reject special Git modes. Validate the proposed tree in an owned temporary index before touching the checkout; check complete ownership policy plus exact source version/commit there. Then run git apply --check --index and apply/index against the clean trusted checkout. Never run npm, Bun, imported candidate modules, hooks, or downloaded scripts in this job.

```js
const normalized = posix.normalize(path);
if (path !== normalized || /[\x00-\x1f\x7f]/u.test(path) ||
    !(path === "upstream.lock.json" || path.startsWith("skills/"))) {
  throw new Error("Proposal path is outside sync ownership");
}
```

Use Git's native temporary-index support to validate the resulting metadata before a real write:

```js
const trustedLock = JSON.parse(await readFile("upstream.lock.json", "utf8"));
const indexDirectory = await mkdtemp(join(tmpdir(), "pstack-proposal-index-"));
try {
  const indexedEnv = { ...process.env, GIT_INDEX_FILE: join(indexDirectory, "index") };
  const indexedGit = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: process.cwd(), env: indexedEnv, encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
  });
  indexedGit("read-tree", expectedBase);
  indexedGit("apply", "--cached", "--check", patchPath);
  indexedGit("apply", "--cached", patchPath);
  const proposedLock = JSON.parse(indexedGit("show", ":upstream.lock.json"));
  const policy = ({ commit, version, ...rest }) => rest;
  if (!isDeepStrictEqual(policy(trustedLock), policy(proposedLock)) ||
      proposedLock.commit !== metadata.sourceCommit ||
      proposedLock.version !== metadata.sourceVersion) {
    throw new Error("Proposal metadata or ownership policy mismatch");
  }
  const modes = new Map(indexedGit("ls-files", "--stage", "-z").split("\0").filter(Boolean).map(entry => [
    entry.slice(entry.indexOf("\t") + 1), entry.slice(0, 6),
  ]));
  for (const path of changedPaths) {
    const mode = modes.get(path);
    if (mode !== undefined && mode !== "100644" && mode !== "100755") {
      throw new Error("Proposal contains a non-regular Git entry");
    }
  }
} finally {
  await rm(indexDirectory, { recursive: true, force: true });
}
```

Import isDeepStrictEqual from node:util. expectedBase is the validated CLI argument, patchPath is the canonical regular proposal.patch input, and metadata is the parsed validated metadata.json. Add an ownership-policy mutation case and require unchanged checkout/index state on rejection.

Check numeric-or-binary numstat fields and reject rename encodings rather than guess; candidate generation uses --no-renames --binary. Require exactly two regular non-symlink artifact files, proposal.patch (at most 10 MiB) and metadata.json (at most 16 KiB), and at most 4096 changed paths. Validate staged modes from the private index as regular Git blobs (100644/100755), then apply only after all checks succeed. Reject unsafe mode headers before applying, not after following a link. These bounds are local package limits, not a general archive service.
- [ ] Keep the configured schedule/manual trigger. Candidate preparation/verification job uses contents:read and persist-credentials:false. Stage the allowlisted update and create the patch with:

```bash
git add --all -- skills upstream.lock.json ':(exclude)**/node_modules/**'
git diff --cached --no-renames --binary HEAD -- skills upstream.lock.json
```

Write metadata from trusted base identity and the proposed lock, upload the two explicit files only, and retain exact source/base information in the PR body. Do not transfer .git or node_modules. Only create an artifact when there is a change and checks succeed.
- [ ] The proposal job runs on a fresh runner, checks out `${{ github.sha }}` with persisted credentials disabled, and receives contents:write/pull-requests:write only there. Run the trusted intake script from that checkout, then the existing pinned create-pull-request action. Do not execute anything from the proposal tree. Remove automatic merge and obsolete merge-only fetch/head logic. The action opens an inspectable proposal, not a compatibility-approved release.
- [ ] Add read-only pull_request/push CI using existing pinned checkout/Node/Bun actions. Run verify, verifier/updater/proposal/RPC unit tests, real package test, bundled Bun tests, and strict typecheck. Model-backed smoke and the multi-host install suite stay separate; do not add fake credential-free model proof.
- [ ] Preserve release trigger/OIDC/trusted-publisher setup/tag check in the user's existing publishing workflow; add the real package gate before npm publication and use `npm publish --provenance --tag omp`. The corresponding first release tag is v0.15.13-omp.1. Do not run or publish the workflow here.
- [ ] Run local proposal-fixture CLI and available actionlint/zizmor checks on actual workflows; if tooling is unavailable, report that rather than claim a remote Actions run. Fresh security review must examine the job boundary and artifact parser. Commit `fix(ci): isolate upstream proposals from write credentials`.

## Task 7: Deliver OMP-first documentation and a coherent release artifact

**Files:** README, docs/installation.md, docs/maintenance.md, CHANGES.md, THIRD_PARTY_NOTICES.md, package files/scripts, and affected help/runtime links. Consume actual implemented behavior, not anticipated results.

**Interfaces:** README is the consumer entry point; detailed other-host and maintainer instructions live in the named docs. Package includes those docs plus the linked existing docs/upstream-compatibility-design.md technical reference, not spec/plan history.

- [ ] Rewrite the opening/quick-start along this concrete shape, retaining the useful existing logo:

```markdown
# oh-my-pstack

An unofficial Oh My Pi-first port of Lauren Tan's Cursor pstack: deliberate workflows, native delegation, and evidence you can inspect.

## Start with Oh My Pi

Install from GitHub:

    omp install https://github.com/JonathanPitre/oh-my-pstack

Start a fresh OMP session, then run:

    /skill:setup-pstack
    /skill:poteto-mode Fix the bug and show failing and passing evidence.

Confirm installation with `omp plugin list --json` and `omp read skill://poteto-mode`.
```

Add short benefits, model/token-use caveat, capability limits, fork/source version distinction, and links to the detailed guides. Do not advertise an unpublished npm release as currently available; record the actual publication prerequisite without performing publication.
- [ ] Move, rather than lose, existing native Pi, OpenCode global/project, Claude, Codex, Gemini, and OMP upgrade instructions into installation.md. Clearly distinguish native Pi extension requirements from OMP's native facilities. Use verified commands and explain skill invocation versus URI loading.
- [ ] Write maintenance.md with the actual deterministic/pack/install/smoke commands, proposal review procedure, trusted local --source behavior, and release/OIDC steps preserved from user edits. Fresh export example:

```bash
npm run sync:check
npm run sync:apply -- --dry-run
npm run sync:export-review -- /tmp/pstack-review-new
npm run sync:apply -- --review /tmp/pstack-review-new --dry-run
```

State the parent must exist and the review leaf must not; use a fresh name for another export. Explain exact source metadata versus the baseline-labeled fork release, independent omp revision increments, the prerelease/omp dist-tag implications, partial-write recovery, and no auto-merge. When preparing a release after a reviewed source advance, select a corresponding release version explicitly; sync does not rewrite it. Do not apply a real moving-upstream update as documentation verification.
- [ ] Add CHANGES.md 0.15.13-omp.1 covering confirmed fixes, OMP behavior evidence, independent fork revisions, proposal-only sync, and intentional local ownership. Add docs/installation.md, docs/maintenance.md, CHANGES.md, and docs/upstream-compatibility-design.md to package files when they exist.
- [ ] Re-read any substantially reused comparator source at the pinned revisions from the spec; preserve applicable MIT notices and record exact paths/commits in THIRD_PARTY_NOTICES.md. If implementing general mechanisms independently without copying material, do not fabricate a copied-code attribution.
- [ ] Run the real verifier/package check; load help/resources through OMP and execute the README installation/setup path in isolated state. Inspect the rendered Markdown for a clear main path and valid links, not merely line-count reduction. Commit `docs: make onboarding OMP-first` with only owned documentation/metadata changes.

## Task 8: Integrated acceptance and independent review

**Files:** No new scaffolding. Repair only affected defects found by verification/review and update the relevant checks/docs.

**Interfaces:** Consume all task outputs; produce complete spec acceptance evidence and no false claim that source checks prove runtime behavior.

- [ ] Run the integrated credential-free suite once after writers settle:

```bash
npm run verify
node --test scripts/verify.test.mjs scripts/sync-upstream.test.mjs scripts/sync-proposal.test.mjs scripts/omp-rpc.test.mjs scripts/package.test.mjs
bun --cwd skills/poteto-mode/scripts test orch watch-pr
bun --cwd skills/poteto-mode/scripts run typecheck
PSTACK_INSTALL_HOSTS=omp npm run test:install
npm run test:install
```

Run the commands from the repository root; the Bun commands explicitly select the bundled-tools directory. Report every executed check and any missing prerequisite accurately.
- [ ] Run `PSTACK_OMP_MODEL=openai-codex/gpt-6.1-sol npm run smoke:omp` only after catalog preflight confirms availability/authentication. Root already observed that exact selector in the local catalog, not a guessed alias. Repeat the behavioral scenarios from a freshly extracted real npm artifact by invoking its scripts/omp-smoke.mjs, so installed candidate source identity—not a live older plugin—is the proof. If authentication fails, use supported diagnostics to resolve the actual prerequisite; never substitute another model silently or report skipped smoke as passing.
- [ ] Inspect retained non-secret traces, resulting configuration, source identity, actual full child results, and settled state. Exercise real fixture CLI export/apply/replay and proposal intake, not source-text assertions.
- [ ] Run fresh independent quality/runtime and security reviews with disjoint scopes: installed behavior/config/lifecycle versus sync/filesystem/credential/job boundary. Reviewers do not run suites mid-flight. Root integrates findings, fixes real issues, and reruns affected acceptance paths.
- [ ] Complete a spec-to-evidence checklist covering all requirements; leave user settings untouched and record unexercised capabilities. Each fixture/owned process uses its established finally/close lifecycle. Do not publish, tag, submit a PR, or update the live installed plugin.
- [ ] Final delivery states implemented changes, comparator mechanisms actually adopted, exercised verification, and genuine remaining external prerequisites. No completion claim for an unrun authenticated scenario or remote workflow.

## Execution Handoff

The approved specification and this plan travel together. Recommended method: **Native execution** with fresh quality and security reviews at the end, because Tasks 1–3 share updater/review state and the later artifact/runtime/release gates cross the same manifests. This preserves integration context without parallel shared-file edits.

Subagent-driven execution remains available: use a fresh implementer/reviewer per independently testable unit, keep updater tasks sequential, and keep package/lock integration owned by the root. All workers skip shared build/lint/test runs mid-flight; the root runs acceptance at integration gates.

The user selected implementation in the current checkout. Preserve the existing README/package/publishing-workflow edits and do not create a worktree or reset the checkout. Runtime/install scenarios still use isolated disposable state. Execution-method approval remains required before product implementation.
