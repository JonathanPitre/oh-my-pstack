#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
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
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(
  process.env.PSTACK_SYNC_ROOT ?? dirname(fileURLToPath(import.meta.url)),
  process.env.PSTACK_SYNC_ROOT ? "." : "..",
);
const lockPath = join(root, "upstream.lock.json");
const boundaryLock = JSON.parse(readFileSync(lockPath, "utf8"));

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

export function isProtectedPath(path) {
  return (
    boundaryLock.protectedPaths.includes(path) ||
    boundaryLock.protectedPrefixes.some((prefix) => path.startsWith(prefix))
  );
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
      entries.set(destination, { content: normalizeContent(content), sourceMode: mode, sourcePath });
    }
  }
  return entries;
}

async function localFile(path) {
  try {
    const raw = await readFile(path);
    if (raw.includes(0)) throw new Error(`Binary destination content is unsupported: ${path}`);
    const content = raw.toString("utf8");
    if (!Buffer.from(content, "utf8").equals(raw)) throw new Error(`Invalid UTF-8 destination content: ${path}`);
    return content;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function mergeAdaptedText(base, ours, theirs, scratchDirectory) {
  const index = mergeAdaptedText.index++;
  const paths = ["ours", "base", "theirs"].map((name) => join(scratchDirectory, `${index}-${name}`));
  await Promise.all(paths.map((path, i) => writeFile(path, [ours, base, theirs][i])));
  const result = spawnSync("git", ["merge-file", "--stdout", ...paths], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 0) return { content: result.stdout, conflict: false };
  if (result.status > 0 && result.status <= 127) return { content: null, conflict: true };
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

async function planUpdate(lock, sourceRoot, commit) {
  const dirtyPaths = git(["status", "--porcelain", "--untracked-files=all", "--",
    ...lock.sourceRoots.map((mapping) => mapping.source)], sourceRoot);
  if (dirtyPaths) throw Object.assign(new Error("source has uncommitted changes in managed paths"), { status: 2 });
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
  const scratch = await mkdtemp(join(tmpdir(), "pstack-merge-"));
  try {
    for (const path of new Set([...base.keys(), ...incoming.keys()])) {
      await validateDestination(path);
      const baseline = base.get(path)?.content ?? null;
      const latest = incoming.get(path)?.content ?? null;
      const local = await localFile(join(root, path));
      let content;
      if (isProtectedPath(path)) {
        if (latest === baseline) continue;
        if (local === latest) continue;
        if (local === baseline) content = latest;
        else if (local !== null && latest !== null && baseline !== null) {
          const merged = await mergeAdaptedText(baseline, local, latest, scratch);
          if (merged.conflict) {
            conflicts.push({ path, reason: "overlapping text edits" });
            continue;
          }
          content = merged.content;
        } else {
          conflicts.push({ path, reason: baseline === null ? "differing simultaneous additions" :
            latest === null ? "upstream deletion versus local adaptation" : "local deletion versus upstream modification" });
          continue;
        }
      } else if (latest === null) {
        if (local === null) continue;
        if (local !== baseline) {
          conflicts.push({ path, reason: "upstream deletion versus locally modified file" });
          continue;
        }
        content = null;
      } else {
        content = latest;
      }
      if (content !== local) operations.push({
        path,
        content,
        sourceMode: isProtectedPath(path) && local !== null
          ? null
          : (incoming.get(path)?.sourceMode ?? base.get(path)?.sourceMode),
      });
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
    mergeAdaptedText.index = 0;
  }
  return { operations, conflicts };
}


function parseArgs(argv) {
  const sourceIndex = argv.indexOf("--source");
  return {
    mode: argv.includes("--check") ? "check" : argv.includes("--apply") ? "apply" : argv.includes("--dry-run") ? "apply" : null,
    dryRun: argv.includes("--dry-run"),
    source: sourceIndex === -1 ? null : argv[sourceIndex + 1],
  };
}

async function sourceRepository(lock, sourceArg) {
  if (sourceArg) return { path: resolve(sourceArg), cleanup: null };
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
    return { path, cleanup: path };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}

async function applyUpdate(lock, sourceRoot, commit, dryRun) {
  const { operations, conflicts } = await planUpdate(lock, sourceRoot, commit);
  if (conflicts.length) {
    console.error("Upstream update conflicts with local adaptations:");
    for (const { path, reason } of conflicts) console.error(`- ${path}: ${reason}`);
    console.error("Resolve conflicts manually before rerunning --apply.");
    return 2;
  }
  for (const operation of operations) {
    console.log(`${dryRun ? "Would" : ""} ${operation.content === null ? "delete" : "update"} ${operation.path}`);
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
    const temporary = join(dirname(lockPath), `.upstream.lock.${process.pid}.tmp`);
    await writeFile(temporary, `${JSON.stringify({ ...lock, commit }, null, 2)}\n`);
    await rename(temporary, lockPath);
  }
  if (!operations.length) console.log(`No managed skill changes for upstream ${commit}.`);
  return 0;
}


export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.mode || (args.source !== null && !args.source)) {
    console.error("Usage: sync-upstream.mjs --check [--source DIR]");
    console.error("       sync-upstream.mjs --apply [--dry-run] [--source DIR]");
    return 64;
  }
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const source = await sourceRepository(lock, args.source);
  try {
    const commit = git(["rev-parse", "HEAD"], source.path);
    console.log(`pinned=${lock.commit}`);
    console.log(`latest=${commit}`);
    if (commit === lock.commit && args.mode === "check") {
      console.log("Upstream is already pinned at the latest checked revision.");
      return 0;
    }
    if (args.mode === "check") return 10;
    return await applyUpdate(lock, source.path, commit, args.dryRun);
  } finally {
    if (source.cleanup) await rm(source.cleanup, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error?.status ?? 1;
  });
}


