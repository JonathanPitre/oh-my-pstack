import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function proposalFixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "pstack-proposal-"));
  const target = join(directory, "target"), artifact = join(directory, "artifact");
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: target, encoding: "utf8" }).trim();
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
    const metadata = { base, sourceCommit: next.commit, sourceVersion: next.version, patchSha256: digest(patch) };
    await writeFile(join(artifact, "proposal.patch"), patch);
    await writeFile(join(artifact, "metadata.json"), JSON.stringify(metadata));
    const cli = (artifactDir = artifact, expectedBase = base) => spawnSync(process.execPath, [new URL("./sync-proposal.mjs", import.meta.url).pathname, artifactDir, expectedBase], { cwd: target, encoding: "utf8" });
    const unchanged = async () => {
      assert.equal(await readFile(join(target, "skills/example/data.txt"), "utf8"), "base\n");
      assert.equal(JSON.parse(await readFile(join(target, "upstream.lock.json"))).commit, lock.commit);
      assert.equal(git("status", "--porcelain"), "");
      assert.equal(git("diff", "--cached"), "");
    };
    await run({ directory, target, artifact, metadata, patch, cli, git, lock, next, unchanged });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeProposal(artifact, metadata, patch) {
  metadata.patchSha256 = digest(patch);
  await writeFile(join(artifact, "proposal.patch"), patch);
  await writeFile(join(artifact, "metadata.json"), JSON.stringify(metadata));
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
    await writeProposal(artifact, metadata, unsafe);
    assert.notEqual(cli().status, 0);
    assert.equal(await readFile(sentinel, "utf8"), "keep\n");
    assert.equal(await readFile(join(target, "skills/example/data.txt"), "utf8"), "base\n");
  });
});

test("proposal rejects a normalized-traversal path", async () => {
  await proposalFixture(async ({ artifact, metadata, patch, cli, unchanged }) => {
    await writeProposal(artifact, metadata, patch.replaceAll("skills/example/data.txt", "skills/example/../example/data.txt"));
    assert.notEqual(cli().status, 0);
    await unchanged();
  });
});

test("proposal rejects a symlink mode before following it", async () => {
  await proposalFixture(async ({ target, artifact, metadata, git, cli, unchanged }) => {
    await symlink("data.txt", join(target, "skills/example/link"));
    git("add", "skills/example/link");
    const patch = execFileSync("git", ["diff", "--cached", "--no-renames", "--binary", "HEAD"], { cwd: target, encoding: "utf8" });
    git("reset", "--hard", "HEAD");
    await writeProposal(artifact, metadata, patch);
    assert.notEqual(cli().status, 0);
    await unchanged();
    await assert.rejects(lstat(join(target, "skills/example/link")), { code: "ENOENT" });
  });
});

test("proposal rejects a submodule mode", async () => {
  await proposalFixture(async ({ artifact, metadata, cli, unchanged }) => {
    const patch = [
      "diff --git a/skills/example/vendor b/skills/example/vendor",
      "new file mode 160000",
      "index 0000000..aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--- /dev/null",
      "+++ b/skills/example/vendor",
      "@@ -0,0 +1 @@",
      "+Subproject commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "",
    ].join("\n");
    await writeProposal(artifact, metadata, patch);
    assert.notEqual(cli().status, 0);
    await unchanged();
  });
});

test("proposal rejects a corrupt digest", async () => {
  await proposalFixture(async ({ artifact, metadata, cli, unchanged }) => {
    metadata.patchSha256 = "0".repeat(64);
    await writeFile(join(artifact, "metadata.json"), JSON.stringify(metadata));
    assert.notEqual(cli().status, 0);
    await unchanged();
  });
});

test("proposal rejects a wrong base", async () => {
  await proposalFixture(async ({ artifact, metadata, cli, unchanged }) => {
    assert.notEqual(cli(artifact, "b".repeat(40)).status, 0);
    metadata.base = "b".repeat(40);
    await writeFile(join(artifact, "metadata.json"), JSON.stringify(metadata));
    assert.notEqual(cli().status, 0);
    await unchanged();
  });
});

test("proposal rejects mismatched source metadata", async () => {
  await proposalFixture(async ({ artifact, metadata, cli, unchanged }) => {
    metadata.sourceCommit = "c".repeat(40);
    await writeFile(join(artifact, "metadata.json"), JSON.stringify(metadata));
    assert.notEqual(cli().status, 0);
    await unchanged();
  });
});

test("proposal rejects an ownership-policy mutation", async () => {
  await proposalFixture(async ({ target, artifact, metadata, lock, next, git, cli, unchanged }) => {
    const mutated = { ...next, protectedPrefixes: ["skills/hijack/"] };
    await writeFile(join(target, "upstream.lock.json"), JSON.stringify(mutated));
    await writeFile(join(target, "skills/example/data.txt"), "incoming\n");
    const patch = execFileSync("git", ["diff", "--no-renames", "--binary", "HEAD"], { cwd: target, encoding: "utf8" });
    await writeFile(join(target, "upstream.lock.json"), JSON.stringify(lock));
    await writeFile(join(target, "skills/example/data.txt"), "base\n");
    await writeProposal(artifact, metadata, patch);
    assert.notEqual(cli().status, 0);
    await unchanged();
    assert.equal(git("status", "--porcelain"), "");
  });
});

test("proposal rejects extra or non-regular artifact files", async () => {
  await proposalFixture(async ({ directory, artifact, cli, unchanged }) => {
    await writeFile(join(artifact, "extra.txt"), "nope\n");
    assert.notEqual(cli().status, 0);
    await rm(join(artifact, "extra.txt"));
    await rm(join(artifact, "proposal.patch"));
    await symlink(join(directory, "target", "skills/example/data.txt"), join(artifact, "proposal.patch"));
    assert.notEqual(cli().status, 0);
    await unchanged();
  });
});
