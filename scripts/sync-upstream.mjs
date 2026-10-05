#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  mkdtemp,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const updaterPath = fileURLToPath(import.meta.url);
const root = resolve(
  process.env.PSTACK_SYNC_ROOT ?? dirname(updaterPath),
  process.env.PSTACK_SYNC_ROOT ? "." : "..",
);
const lockPath = join(root, "upstream.lock.json");
const boundaryLock = JSON.parse(readFileSync(lockPath, "utf8"));
const REVIEW_VERSION = 1;
const MARKERS = /^(<<<<<<<|=======|>>>>>>>)/m;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function normalizeContent(source) {
  return source
    .replaceAll("~/.cursor/rules/pstack-models.mdc", "$PSTACK_CONFIG (or .pstack/config.md)")
    .replace(/\/[^/\s]+(?:\/[^/\s]+)*\/\.cursor\/rules\/pstack-models\.mdc/g, "$PSTACK_CONFIG (or .pstack/config.md)")
    .replace(/[A-Za-z]:\\(?:[^\\\s]+\\)*\.cursor\\rules\\pstack-models\.mdc/g, "$PSTACK_CONFIG (or .pstack/config.md)")
    .replaceAll(".cursor/skills/", "skills/")
    .replaceAll(".cursor/plugins/", "plugins/")
    .replaceAll("subagent_type:", "role:")
    .replaceAll("AskQuestion", "structured interaction tool")
    .replaceAll('environment: "cloud"', "environment: host-managed")
    .replaceAll("environment: 'cloud'", "environment: host-managed")
    .replaceAll("claude-fable-5-thinking-max", "host-configured role/model")
    .replaceAll("claude-fable-5-1-thinking-max", "host-configured role/model")
    .replaceAll("gpt-5.6-sol-max", "host-configured role/model")
    .replaceAll("grok-4.6-fast-xhigh", "host-configured role/model")
    .replaceAll("claude-opus-5-thinking-xhigh", "host-configured role/model")
    .replaceAll(/\bTask (?:subagent|tool)\b/g, "host task runner");
}

function normalizeDocumentationLinks(content, sourcePath, sourceRoot, revision, lock) {
  if (!sourcePath.endsWith(".md")) return content;
  return content.replace(/\]\(([^)#][^)]*)\)/gu, (match, target) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(target)) return match;
    const upstreamPath = posix.normalize(posix.join(posix.dirname(sourcePath), target));
    if (!upstreamPath.startsWith(`${lock.path}/docs/`)) return match;
    try {
      git(["cat-file", "-e", `${revision}:${upstreamPath.split("#", 1)[0]}`], sourceRoot);
    } catch {
      throw new Error(`Missing upstream documentation: ${sourcePath} references ${target}`);
    }
    return `](${lock.repository.replace(/\.git$/u, "")}/blob/${revision}/${upstreamPath})`;
  });
}

export function isProtectedPath(path) {
  return (
    boundaryLock.protectedPaths.includes(path) ||
    boundaryLock.protectedPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

function implementationDigest() {
  return createHash("sha256").update(readFileSync(updaterPath)).digest("hex");
}

function digestText(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function fileMode(stat) {
  return (stat.mode & 0o111) ? "100755" : "100644";
}

function stateRecord(state) {
  return state === null ? null : { mode: state.mode, digest: digestText(state.content) };
}

function sameState(left, right) {
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return left.content === right.content && left.mode === right.mode;
}

function sameStateMap(left, right) {
  if (left.size !== right.size) return false;
  for (const [path, state] of left) {
    if (!right.has(path) || !sameState(state, right.get(path))) return false;
  }
  return true;
}

function assertOutsideDestination(resolved, label) {
  if (resolved === root || resolved.startsWith(`${root}${sep}`)) {
    throw new Error(`Unsafe ${label} path inside destination: ${resolved}`);
  }
}

function lockConfig(lock) {
  const { commit, ...config } = lock;
  return JSON.stringify(config);
}

function decodeUtf8(raw, label) {
  if (raw.includes(0)) throw new Error(`NUL in ${label}`);
  const content = raw.toString("utf8");
  if (!Buffer.from(content, "utf8").equals(raw)) throw new Error(`Invalid UTF-8 ${label}`);
  return content;
}

export const PORTABLE_VERSION_PATHS = [
  "package.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
];

export function upstreamPluginManifestPath(lock) {
  return `${lock.path}/.cursor-plugin/plugin.json`;
}

export function readUpstreamPluginVersion(lock, sourceRoot, commit) {
  const rel = upstreamPluginManifestPath(lock);
  const entry = git(["ls-tree", "-z", commit, "--", rel], sourceRoot).split("\0").filter(Boolean);
  if (entry.length !== 1) throw new Error(`Missing upstream ${rel} at ${commit}`);
  const [metadata, path] = entry[0].split("\t");
  const [mode, type] = metadata.split(" ");
  if (path !== rel || mode !== "100644" && mode !== "100755" || type !== "blob") {
    throw new Error(`Upstream ${rel} at ${commit} is not a regular file`);
  }
  const parsed = JSON.parse(git(["show", `${commit}:${rel}`], sourceRoot));
  if (typeof parsed.version !== "string" || !parsed.version) {
    throw new Error(`Upstream ${rel} at ${commit} is missing a string version field`);
  }
  return parsed.version;
}

async function planPortableVersions(lock, sourceRoot, commit) {
  const upstreamVersion = readUpstreamPluginVersion(lock, sourceRoot, commit);
  const writes = [];
  for (const rel of PORTABLE_VERSION_PATHS) {
    await validateDestination(rel);
    const path = join(root, rel);
    const stat = await rejectSymlink(path, "version manifest");
    if (!stat || !stat.isFile()) throw new Error(`Missing regular destination version manifest: ${rel}`);
    const parsed = JSON.parse(decodeUtf8(await readFile(path), rel));
    if (typeof parsed.version !== "string" || !parsed.version) {
      throw new Error(`${rel} is missing a nonempty string version field`);
    }
    if (parsed.version !== upstreamVersion) {
      writes.push({ rel, path, content: `${JSON.stringify({ ...parsed, version: upstreamVersion }, null, 2)}\n` });
    }
  }
  return { upstreamVersion, writes };
}

function hasCommit(sourceRoot, commit) {
  try {
    git(["cat-file", "-e", `${commit}^{commit}`], sourceRoot);
    return true;
  } catch {
    return false;
  }
}

function requireCommits(sourceRoot, commits) {
  for (const commit of new Set(commits.filter(Boolean))) {
    if (!hasCommit(sourceRoot, commit)) {
      throw Object.assign(new Error(`reviewed revision ${commit} is unavailable from the lock-authorized source`), { status: 2 });
    }
  }
}

function fetchCommit(sourceRoot, commit) {
  if (hasCommit(sourceRoot, commit)) return;
  try {
    execFileSync("git", ["fetch", "--quiet", "--depth", "1", "origin", commit], { cwd: sourceRoot });
  } catch {}
  if (hasCommit(sourceRoot, commit)) return;
  try {
    execFileSync("git", ["fetch", "--quiet", "origin", commit], { cwd: sourceRoot });
  } catch {
    // requireCommits reports unavailable history.
  }
}

async function rejectSymlink(path, label) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlinked ${label}: ${path}`);
    return stat;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function resolveDirectory(path, { mustExist, label }) {
  if (!path || path.includes("\0")) throw new Error(`Invalid ${label} path`);
  const resolved = resolve(path);
  const stat = await rejectSymlink(resolved, label);
  if (stat && !stat.isDirectory()) throw new Error(`Non-directory ${label} path: ${path}`);
  if (!stat && mustExist) throw new Error(`Missing ${label} path: ${path}`);
  assertOutsideDestination(resolved, label);
  return resolved;
}

function entryDirectory(reviewRoot, id) {
  if (typeof id !== "string" || !/^\d+$/.test(id)) throw new Error(`unsafe review entry id: ${id}`);
  const entriesRoot = join(reviewRoot, "entries");
  const directory = resolve(entriesRoot, id);
  if (directory !== join(entriesRoot, id) || !directory.startsWith(`${entriesRoot}${sep}`)) {
    throw new Error(`unsafe review entry id: ${id}`);
  }
  return directory;
}

async function inventory(lock, sourceRoot, revision) {
  const entries = new Map();
  for (const mapping of lock.sourceRoots) {
    const output = execFileSync("git", [
      "ls-tree", "-r", "-z", revision, "--", mapping.source,
    ], { cwd: sourceRoot, encoding: "buffer" });
    for (const record of output.toString("utf8").split("\0").filter(Boolean)) {
      const tab = record.indexOf("\t");
      const [mode, type, object] = record.slice(0, tab).split(" ");
      const sourcePath = record.slice(tab + 1);
      const suffix = sourcePath.slice(mapping.source.length + 1);
      if (suffix.split("/").includes("node_modules")) continue;
      const destination = `${mapping.destination}/${suffix}`;
      if (entries.has(destination)) throw new Error(`Duplicate upstream destination mapping: ${destination}`);
      if (!["100644", "100755"].includes(mode) || type !== "blob") {
        throw new Error(`Unsupported upstream source type for ${destination}: ${mode} ${type}`);
      }
      const raw = execFileSync("git", ["show", `${revision}:${sourcePath}`], {
        cwd: sourceRoot,
        encoding: "buffer",
      });
      if (raw.includes(0)) throw new Error(`Binary upstream content is unsupported: ${destination}`);
      const content = raw.toString("utf8");
      if (!Buffer.from(content, "utf8").equals(raw)) throw new Error(`Invalid UTF-8 upstream content: ${destination}`);
      entries.set(destination, {
        content: normalizeDocumentationLinks(normalizeContent(content), sourcePath, sourceRoot, revision, lock),
        sourceMode: mode,
        sourcePath,
      });
    }
  }
  return entries;
}

async function localState(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlinked destination path: ${path}`);
    const raw = await readFile(path);
    if (raw.includes(0)) throw new Error(`Binary destination content is unsupported: ${path}`);
    const content = raw.toString("utf8");
    if (!Buffer.from(content, "utf8").equals(raw)) throw new Error(`Invalid UTF-8 destination content: ${path}`);
    return { content, mode: fileMode(stat) };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function asState(entry) {
  return entry ? { content: entry.content, mode: entry.sourceMode } : null;
}

async function mergeAdaptedText(base, ours, theirs, scratchDirectory) {
  const index = mergeAdaptedText.index++;
  const paths = ["ours", "base", "theirs"].map((name) => join(scratchDirectory, `${index}-${name}`));
  await Promise.all(paths.map((path, i) => writeFile(path, [ours, base, theirs][i])));
  const result = spawnSync("git", ["merge-file", "--stdout", ...paths], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 0) return { content: result.stdout, conflict: false };
  if (result.status > 0 && result.status <= 127) return { content: result.stdout, conflict: true };
  throw new Error(result.stderr || `git merge-file failed with status ${result.status}`);
}
mergeAdaptedText.index = 0;

async function validateDestination(destination) {
  const fullPath = resolve(root, destination);
  if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) {
    throw new Error(`Destination escapes target root: ${destination}`);
  }
  let current = root;
  for (const part of destination.split("/")) {
    current = join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlinked destination path: ${destination}`);
      if (current !== fullPath && !stat.isDirectory()) throw new Error(`Non-directory destination ancestor: ${destination}`);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
}

async function reconcilePath(path, baseline, local, incoming, scratch) {
  const baseContent = baseline?.content ?? null;
  const localContent = local?.content ?? null;
  const latest = incoming?.content ?? null;
  const sourceMode = isProtectedPath(path) && localContent !== null
    ? null
    : (incoming?.mode ?? baseline?.mode ?? null);
  const operation = (content) => (content === localContent ? null : { path, content, sourceMode });
  if (isProtectedPath(path)) {
    if (latest === baseContent) return { outcome: { kind: "keep" }, operation: null, proposal: null };
    if (localContent === latest) return { outcome: { kind: "keep" }, operation: null, proposal: null };
    if (localContent === baseContent) {
      return { outcome: { kind: latest === null ? "delete" : "write" }, operation: operation(latest), proposal: null };
    }
    if (localContent !== null && latest !== null && baseContent !== null) {
      const merged = await mergeAdaptedText(baseContent, localContent, latest, scratch);
      if (merged.conflict) {
        return { outcome: { kind: "conflict", reason: "overlapping text edits" }, operation: null, proposal: merged.content ?? "" };
      }
      return { outcome: { kind: "write" }, operation: operation(merged.content), proposal: null };
    }
    return {
      outcome: {
        kind: "conflict",
        reason: baseContent === null ? "differing simultaneous additions" :
          latest === null ? "upstream deletion versus local adaptation" : "local deletion versus upstream modification",
      },
      operation: null,
      proposal: "",
    };
  }
  if (latest === null) {
    if (localContent === null) return { outcome: { kind: "keep" }, operation: null, proposal: null };
    if (localContent !== baseContent) {
      return { outcome: { kind: "conflict", reason: "upstream deletion versus locally modified file" }, operation: null, proposal: "" };
    }
    return { outcome: { kind: "delete" }, operation: operation(null), proposal: null };
  }
  return { outcome: { kind: latest === localContent ? "keep" : "write" }, operation: operation(latest), proposal: null };
}

async function planUpdate(lock, sourceRoot, commit, locals = null) {
  const dirtyPaths = git(["status", "--porcelain", "--untracked-files=all", "--",
    ...lock.sourceRoots.map((mapping) => mapping.source),
    upstreamPluginManifestPath(lock)], sourceRoot);
  if (dirtyPaths) throw Object.assign(new Error("source has uncommitted changes in managed paths or upstream version manifest"), { status: 2 });
  try {
    git(["cat-file", "-e", `${lock.commit}^{commit}`], sourceRoot);
  } catch {
    throw Object.assign(new Error(`baseline ${lock.commit} unavailable for comparison with ${commit}`), { status: 2 });
  }
  const [base, incoming] = await Promise.all([
    inventory(lock, sourceRoot, lock.commit),
    inventory(lock, sourceRoot, commit),
  ]);
  const operations = [];
  const conflicts = [];
  const comparisons = [];
  const scratch = await mkdtemp(join(tmpdir(), "pstack-merge-"));
  try {
    for (const path of [...new Set([...base.keys(), ...incoming.keys()])].sort()) {
      await validateDestination(path);
      const baseline = asState(base.get(path));
      const incomingState = asState(incoming.get(path));
      const local = locals ? (locals.get(path) ?? null) : await localState(join(root, path));
      const reconciled = await reconcilePath(path, baseline, local, incomingState, scratch);
      comparisons.push({ path, baseline, local, incoming: incomingState, ...reconciled });
      if (reconciled.outcome.kind === "conflict") conflicts.push({ path, reason: reconciled.outcome.reason });
      else if (reconciled.operation) operations.push(reconciled.operation);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
    mergeAdaptedText.index = 0;
  }
  return { operations, conflicts, comparisons };
}

function flagValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? "" : value;
}

function parseArgs(argv) {
  const source = flagValue(argv, "--source");
  const exportReview = flagValue(argv, "--export-review");
  const review = flagValue(argv, "--review");
  const check = argv.includes("--check");
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run");
  const mode = exportReview !== null ? "export-review" : check ? "check" : apply || dryRun ? "apply" : null;
  return { mode, dryRun, source, exportReview, review, check, apply };
}

function usage() {
  console.error("Usage: sync-upstream.mjs --check [--source DIR]");
  console.error("       sync-upstream.mjs --apply [--dry-run] [--source DIR]");
  console.error("       sync-upstream.mjs --export-review DIR [--source DIR]");
  console.error("       sync-upstream.mjs --apply --review DIR [--dry-run] [--source DIR]");
}

async function sourceRepository(lock, sourceArg, requiredCommits = []) {
  if (sourceArg) {
    const path = resolve(sourceArg);
    if (path.includes("\0")) throw new Error("Invalid source path");
    await rejectSymlink(path, "source");
    assertOutsideDestination(path, "source");
    requireCommits(path, requiredCommits);
    return { path, cleanup: null };
  }
  const path = await mkdtemp(join(tmpdir(), "pstack-upstream-"));
  try {
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--branch", lock.ref, lock.repository, path],
      { stdio: "inherit" },
    );
    try {
      execFileSync(
        "git",
        ["fetch", "--quiet", "--depth", "1", "origin", lock.commit],
        { cwd: path },
      );
    } catch {
      // A missing baseline makes protected-file review fail closed.
    }
    for (const commit of new Set(requiredCommits.filter(Boolean))) fetchCommit(path, commit);
    requireCommits(path, requiredCommits);
    return { path, cleanup: path };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}

function reportConflicts(conflicts) {
  console.error("Upstream update conflicts with local adaptations:");
  for (const { path, reason } of conflicts) console.error(`- ${path}: ${reason}`);
  console.error("Export a review with --export-review DIR, resolve each conflict, then rerun --apply --review DIR.");
}

async function applyOperations(lock, sourceRoot, commit, operations, dryRun) {
  const versionPlan = await planPortableVersions(lock, sourceRoot, commit);
  for (const operation of operations) {
    console.log(`${dryRun ? "Would" : ""} ${operation.content === null ? "delete" : "update"} ${operation.path}`);
  }
  for (const { rel } of versionPlan.writes) {
    console.log(`${dryRun ? "Would update" : "update"} ${rel} version -> ${versionPlan.upstreamVersion}`);
  }
  if (!dryRun) {
    for (const operation of operations) {
      const path = join(root, operation.path);
      if (operation.content === null) {
        await unlink(path).catch((error) => { if (error.code !== "ENOENT") throw error; });
      } else {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, operation.content);
        if (operation.sourceMode !== null) {
          await chmod(path, operation.sourceMode === "100755" ? 0o755 : 0o644);
        }
      }
    }
    for (const { path, content } of versionPlan.writes) await writeFile(path, content);
    const temporary = join(dirname(lockPath), `.upstream.lock.${process.pid}.tmp`);
    await writeFile(temporary, `${JSON.stringify({ ...lock, commit }, null, 2)}\n`);
    await rename(temporary, lockPath);
  }
  if (!operations.length) console.log(`No managed skill changes for upstream ${commit}.`);
  return 0;
}

async function applyUpdate(lock, sourceRoot, commit, dryRun) {
  const { operations, conflicts } = await planUpdate(lock, sourceRoot, commit);
  if (conflicts.length) {
    reportConflicts(conflicts);
    return 2;
  }
  return applyOperations(lock, sourceRoot, commit, operations, dryRun);
}

async function writeSnapshot(directory, name, state) {
  const path = join(directory, name);
  if (state === null) await unlink(path).catch((error) => { if (error.code !== "ENOENT") throw error; });
  else await writeFile(path, state.content);
}

async function readSnapshot(directory, name) {
  const path = join(directory, name);
  const stat = await rejectSymlink(path, "review snapshot");
  if (!stat) return null;
  if (!stat.isFile()) throw new Error(`Non-file review snapshot: ${path}`);
  return decodeUtf8(await readFile(path), `review snapshot ${name}`);
}

async function exportReview(lock, sourceRoot, commit, reviewDir) {
  const reviewRoot = await resolveDirectory(reviewDir, { mustExist: false, label: "review" });
  const { comparisons } = await planUpdate(lock, sourceRoot, commit);
  await mkdir(join(reviewRoot, "entries"), { recursive: true });
  const entries = [];
  for (const [index, comparison] of comparisons.entries()) {
    const id = String(index + 1);
    const directory = entryDirectory(reviewRoot, id);
    await mkdir(directory, { recursive: true });
    await writeSnapshot(directory, "base.txt", comparison.baseline);
    await writeSnapshot(directory, "local.txt", comparison.local);
    await writeSnapshot(directory, "incoming.txt", comparison.incoming);
    if (comparison.outcome.kind === "conflict") {
      await writeFile(join(directory, "proposal.txt"), comparison.proposal ?? "");
    }
    entries.push({
      id,
      path: comparison.path,
      baseline: stateRecord(comparison.baseline),
      local: stateRecord(comparison.local),
      incoming: stateRecord(comparison.incoming),
      outcome: comparison.outcome,
      decision: null,
    });
  }
  const manifest = {
    version: REVIEW_VERSION,
    lock,
    commit,
    implementation: implementationDigest(),
    entries,
  };
  await writeFile(join(reviewRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return 0;
}

async function loadManifest(reviewDir) {
  const reviewRoot = await resolveDirectory(reviewDir, { mustExist: true, label: "review" });
  const manifestPath = join(reviewRoot, "manifest.json");
  const stat = await rejectSymlink(manifestPath, "review manifest");
  if (!stat) throw new Error("Missing review manifest.json");
  const manifest = JSON.parse(decodeUtf8(await readFile(manifestPath), "review manifest"));
  if (manifest.version !== REVIEW_VERSION) throw new Error(`Unsupported review manifest version: ${manifest.version}`);
  if (typeof manifest.commit !== "string" || !manifest.lock || !Array.isArray(manifest.entries)) {
    throw new Error("Invalid review manifest");
  }
  return { reviewRoot, manifest };
}

async function boundState(directory, name, recorded, actual, path) {
  const content = await readSnapshot(directory, name);
  if (recorded === null) {
    if (content !== null || actual !== null) throw new Error(`review ${name} does not match ${path}`);
    return;
  }
  if (actual === null || content === null || actual.content !== content || actual.mode !== recorded.mode || recorded.digest !== digestText(content)) {
    throw new Error(`review ${name} does not match ${path}`);
  }
}

async function readDecision(reviewRoot, entry) {
  const decision = entry.decision;
  if (decision == null) return null;
  if (decision.kind !== "write" && decision.kind !== "delete") {
    throw new Error(`Invalid review decision for ${entry.path}`);
  }
  if (typeof decision.reason !== "string" || decision.reason.trim() === "") {
    throw new Error(`review decision for ${entry.path} requires a nonempty reason`);
  }
  if (decision.kind === "delete") return { kind: "delete", reason: decision.reason };
  const resolvedPath = join(entryDirectory(reviewRoot, entry.id), "resolved.txt");
  const stat = await rejectSymlink(resolvedPath, "resolved text");
  if (!stat) throw new Error(`Missing resolved text for ${entry.path}`);
  if (!stat.isFile()) throw new Error(`Non-file resolved text for ${entry.path}`);
  const content = decodeUtf8(await readFile(resolvedPath), `resolved text for ${entry.path}`);
  if (MARKERS.test(content)) throw new Error(`Unresolved conflict markers in ${entry.path}`);
  return { kind: "write", reason: decision.reason, content };
}

function rebuildFinal(comparisons, decisions) {
  const final = new Map();
  for (const comparison of comparisons) {
    if (comparison.outcome.kind === "conflict") {
      const decision = decisions.get(comparison.path);
      if (decision.kind === "delete") final.set(comparison.path, null);
      else {
        final.set(comparison.path, {
          content: decision.content,
          mode: comparison.local?.mode ?? comparison.incoming?.mode ?? comparison.baseline?.mode ?? "100644",
        });
      }
    } else if (comparison.operation?.content === null) final.set(comparison.path, null);
    else if (comparison.operation) {
      final.set(comparison.path, {
        content: comparison.operation.content,
        mode: comparison.operation.sourceMode ?? comparison.local?.mode ?? comparison.incoming?.mode ?? "100644",
      });
    } else final.set(comparison.path, comparison.local);
  }
  return final;
}

function reviewedOperations(comparisons, decisions) {
  const operations = [];
  for (const comparison of comparisons) {
    if (comparison.outcome.kind === "conflict") {
      const decision = decisions.get(comparison.path);
      if (decision.kind === "delete") {
        if (comparison.local !== null) operations.push({ path: comparison.path, content: null, sourceMode: null });
      } else {
        const sourceMode = isProtectedPath(comparison.path) && comparison.local !== null
          ? null
          : (comparison.incoming?.mode ?? comparison.baseline?.mode ?? null);
        if (comparison.local?.content !== decision.content) {
          operations.push({ path: comparison.path, content: decision.content, sourceMode });
        }
      }
    } else if (comparison.operation) operations.push(comparison.operation);
  }
  return operations;
}

async function applyReviewedUpdate(lock, sourceRoot, commit, dryRun, reviewDir) {
  const { reviewRoot, manifest } = await loadManifest(reviewDir);
  if (manifest.implementation !== implementationDigest()) throw new Error("review implementation does not match this updater");
  if (lockConfig(lock) !== lockConfig(manifest.lock)) throw new Error("review lock configuration does not match the current lock");
  if (commit !== manifest.commit) throw new Error(`source revision ${commit} does not match reviewed incoming ${manifest.commit}`);
  const entries = manifest.entries;
  const ids = entries.map((entry) => entry.id);
  const paths = entries.map((entry) => entry.path);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate review entry id");
  if (new Set(paths).size !== paths.length) throw new Error("duplicate review entry path");
  const locals = new Map();
  for (const entry of entries) {
    const directory = entryDirectory(reviewRoot, entry.id);
    const content = await readSnapshot(directory, "local.txt");
    if ((content === null) !== (entry.local === null)) throw new Error(`review local snapshot does not match ${entry.path}`);
    if (entry.local && (entry.local.digest !== digestText(content) || !entry.local.mode)) {
      throw new Error(`review local snapshot does not match ${entry.path}`);
    }
    locals.set(entry.path, content === null ? null : { content, mode: entry.local.mode });
  }
  const { comparisons } = await planUpdate(manifest.lock, sourceRoot, manifest.commit, locals);
  if (comparisons.length !== entries.length) throw new Error("review entries do not cover the mapped path set");
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const decisions = new Map();
  const live = new Map();
  for (const comparison of comparisons) {
    const entry = byPath.get(comparison.path);
    if (!entry) throw new Error(`omitted review entry for ${comparison.path}`);
    const directory = entryDirectory(reviewRoot, entry.id);
    await boundState(directory, "base.txt", entry.baseline, comparison.baseline, comparison.path);
    await boundState(directory, "incoming.txt", entry.incoming, comparison.incoming, comparison.path);
    if (!sameState(comparison.local, locals.get(comparison.path) ?? null)) {
      throw new Error(`review local snapshot does not match ${comparison.path}`);
    }
    if (entry.outcome?.kind !== comparison.outcome.kind) throw new Error(`review outcome drift for ${comparison.path}`);
    if (comparison.outcome.kind === "conflict") {
      const decision = await readDecision(reviewRoot, entry);
      if (decision == null) throw new Error(`Missing review decision for ${comparison.path}`);
      decisions.set(comparison.path, decision);
    } else if (entry.decision != null) {
      throw new Error(`Review decision for ${comparison.path} cannot override ordinary updater content`);
    }
    live.set(comparison.path, await localState(join(root, comparison.path)));
  }
  for (const entry of entries) {
    if (!comparisons.some((comparison) => comparison.path === entry.path)) {
      throw new Error(`unknown review entry path: ${entry.path}`);
    }
  }
  const original = locals;
  const final = rebuildFinal(comparisons, decisions);
  const originalMatch = sameStateMap(live, original) && lock.commit === manifest.lock.commit;
  const finalMatch = sameStateMap(live, final) && lock.commit === manifest.commit;
  if (finalMatch) {
    const versionPlan = await planPortableVersions(lock, sourceRoot, manifest.commit);
    for (const { rel, path, content } of versionPlan.writes) {
      console.log(`${dryRun ? "Would update" : "update"} ${rel} version -> ${versionPlan.upstreamVersion}`);
      if (!dryRun) await writeFile(path, content);
    }
    console.log(`No managed skill changes for upstream ${manifest.commit}.`);
    return 0;
  }
  if (!originalMatch) {
    throw new Error("Review does not match original managed inputs or the reconstructed final managed state. Restore the original managed inputs in an isolated checkout or recreate a disposable worktree, then retry. The updater does not roll back mixed destination writes.");
  }
  return applyOperations(lock, sourceRoot, manifest.commit, reviewedOperations(comparisons, decisions), dryRun);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.mode || args.source === "" || args.exportReview === "" || args.review === "") {
    usage();
    return 64;
  }
  if (args.exportReview !== null && (args.check || args.apply || args.review !== null)) {
    usage();
    return 64;
  }
  if (args.review !== null && args.mode !== "apply") {
    usage();
    return 64;
  }
  if (args.check && args.apply) {
    usage();
    return 64;
  }
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const required = [];
  if (args.mode === "export-review") required.push(lock.commit);
  if (args.review) {
    const loaded = await loadManifest(args.review);
    if (loaded.manifest.implementation !== implementationDigest()) {
      throw new Error("review implementation does not match this updater");
    }
    if (lockConfig(lock) !== lockConfig(loaded.manifest.lock)) {
      throw new Error("review lock configuration does not match the current lock");
    }
    required.push(loaded.manifest.lock.commit, loaded.manifest.commit);
  }
  const source = await sourceRepository(lock, args.source, required);
  try {
    const commit = git(["rev-parse", "HEAD"], source.path);
    console.log(`pinned=${lock.commit}`);
    console.log(`latest=${commit}`);
    if (args.mode === "check") {
      const versionPlan = await planPortableVersions(lock, source.path, lock.commit);
      console.log(`upstream-version=${versionPlan.upstreamVersion}`);
      const behind = commit !== lock.commit;
      const versionDrift = versionPlan.writes.length > 0;
      if (behind || versionDrift) {
        if (!behind) {
          console.log("Portable manifest versions do not match the upstream plugin at the pinned commit.");
        }
        return 10;
      }
      console.log("Upstream is already pinned at the latest checked revision.");
      console.log("Portable manifest versions match the upstream plugin at the pin.");
      return 0;
    }
    if (args.mode === "export-review") return await exportReview(lock, source.path, commit, args.exportReview);
    if (args.review) return await applyReviewedUpdate(lock, source.path, commit, args.dryRun, args.review);
    return await applyUpdate(lock, source.path, commit, args.dryRun);
  } finally {
    if (source.cleanup) await rm(source.cleanup, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === updaterPath) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error?.status ?? 1;
  });
}
