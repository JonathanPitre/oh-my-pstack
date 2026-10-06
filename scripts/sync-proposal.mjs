import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix } from "node:path";
import { isDeepStrictEqual } from "node:util";

const PATCH_LIMIT = 10 * 1024 * 1024;
const METADATA_LIMIT = 16 * 1024;
const PATH_LIMIT = 4096;
const REGULAR_MODES = new Set(["100644", "100755"]);
const COMMIT = /^[0-9a-f]{40}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const MODE_HEADER = /^(?:old|new|deleted file|new file) mode ([0-7]{6})$/gmu;

function fail(message) {
  throw new Error(message);
}

function git(args, { cwd = process.cwd(), env = process.env, encoding = "utf8" } = {}) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    env,
    encoding,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function allowedPath(path) {
  const normalized = posix.normalize(path);
  if (path !== normalized || /[\x00-\x1f\x7f]/u.test(path) || isAbsolute(path) ||
      !(path === "upstream.lock.json" || path.startsWith("skills/"))) {
    fail("Proposal path is outside sync ownership");
  }
}

function parseNumstat(output) {
  const paths = new Set();
  let rest = output;
  while (rest.length > 0) {
    const nul = rest.indexOf("\0");
    if (nul < 0) {
      if (rest.trim() === "") break;
      fail("Proposal numstat is truncated");
    }
    const record = rest.slice(0, nul);
    rest = rest.slice(nul + 1);
    const fields = record.split("\t");
    if (fields.length !== 3) fail("Proposal contains a rename encoding");
    const [added, deleted, path] = fields;
    if (!((/^\d+$/u.test(added) && /^\d+$/u.test(deleted)) || (added === "-" && deleted === "-"))) {
      fail("Proposal numstat is not numeric or binary");
    }
    allowedPath(path);
    paths.add(path);
  }
  if (paths.size > PATH_LIMIT) fail("Proposal exceeds the changed-path limit");
  return paths;
}

function rejectUnsafePatch(patch) {
  if (/^rename (?:from|to) /mu.test(patch) || /^similarity index /mu.test(patch)) {
    fail("Proposal contains a rename encoding");
  }
  for (const match of patch.matchAll(MODE_HEADER)) {
    if (!REGULAR_MODES.has(match[1])) fail("Proposal contains a non-regular Git entry");
  }
}

async function regularFile(directory, name, limit) {
  const path = join(directory, name);
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`Proposal artifact ${name} must be a regular file`);
  if (stat.size > limit) fail(`Proposal artifact ${name} exceeds its size limit`);
  return path;
}

function parseMetadata(text) {
  let metadata;
  try { metadata = JSON.parse(text); }
  catch { fail("Proposal metadata is not JSON"); }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) fail("Proposal metadata is malformed");
  const { base, sourceCommit, sourceVersion, patchSha256 } = metadata;
  if (![base, sourceCommit, sourceVersion, patchSha256].every(value => typeof value === "string" && value.length > 0)) {
    fail("Proposal metadata is missing required string fields");
  }
  if (!COMMIT.test(base) || !COMMIT.test(sourceCommit) || !DIGEST.test(patchSha256)) fail("Proposal metadata identity is malformed");
  return { base, sourceCommit, sourceVersion, patchSha256 };
}

function policy(lock) {
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) fail("Proposal lock is malformed");
  const { commit, version, ...rest } = lock;
  return rest;
}

async function main() {
  const artifactDir = process.argv[2];
  const expectedBase = process.argv[3];
  if (!artifactDir || !expectedBase || process.argv.length !== 4) fail("Usage: sync-proposal.mjs <artifact-directory> <expected-base>");
  if (!COMMIT.test(expectedBase)) fail("Expected base must be a 40-character commit");

  const names = (await readdir(artifactDir)).sort();
  if (names.length !== 2 || names[0] !== "metadata.json" || names[1] !== "proposal.patch") {
    fail("Proposal must contain only proposal.patch and metadata.json");
  }
  const patchPath = await regularFile(artifactDir, "proposal.patch", PATCH_LIMIT);
  const metadataPath = await regularFile(artifactDir, "metadata.json", METADATA_LIMIT);
  const metadata = parseMetadata(await readFile(metadataPath, "utf8"));
  const patchBytes = await readFile(patchPath);
  const patch = patchBytes.toString("utf8");
  if (createHash("sha256").update(patchBytes).digest("hex") !== metadata.patchSha256) fail("Proposal digest mismatch");
  rejectUnsafePatch(patch);

  const head = git(["rev-parse", "HEAD"]).trim();
  if (head !== expectedBase || metadata.base !== expectedBase) fail("Proposal base does not match the trusted checkout");
  if (git(["status", "--porcelain", "-z"])) fail("Trusted checkout is not clean");

  const changedPaths = parseNumstat(git(["apply", "--numstat", "-z", patchPath]));
  if (changedPaths.size === 0) fail("Proposal does not change owned paths");

  const trustedLock = JSON.parse(await readFile("upstream.lock.json", "utf8"));
  const indexDirectory = await mkdtemp(join(tmpdir(), "pstack-proposal-index-"));
  try {
    const indexedEnv = { ...process.env, GIT_INDEX_FILE: join(indexDirectory, "index") };
    const indexedGit = (...args) => git(args, { env: indexedEnv });
    indexedGit("read-tree", expectedBase);
    indexedGit("apply", "--cached", "--check", patchPath);
    indexedGit("apply", "--cached", patchPath);
    const proposedLock = JSON.parse(indexedGit("show", ":upstream.lock.json"));
    if (!isDeepStrictEqual(policy(trustedLock), policy(proposedLock)) ||
        proposedLock.commit !== metadata.sourceCommit ||
        proposedLock.version !== metadata.sourceVersion) {
      fail("Proposal metadata or ownership policy mismatch");
    }
    const modes = new Map(indexedGit("ls-files", "--stage", "-z").split("\0").filter(Boolean).map(entry => [
      entry.slice(entry.indexOf("\t") + 1), entry.slice(0, 6),
    ]));
    for (const path of changedPaths) {
      const mode = modes.get(path);
      if (mode !== undefined && !REGULAR_MODES.has(mode)) fail("Proposal contains a non-regular Git entry");
    }
  } finally {
    await rm(indexDirectory, { recursive: true, force: true });
  }

  git(["apply", "--check", "--index", patchPath]);
  git(["apply", "--index", patchPath]);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
