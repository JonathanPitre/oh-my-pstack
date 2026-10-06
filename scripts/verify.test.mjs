import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repository = resolve(import.meta.dirname, "..");

async function withVerifyFixture(run) {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-verify-"));
  try {
    for (const path of ["skills", "README.md", "package.json", "scripts/verify.mjs", ".claude-plugin", ".codex-plugin", ".agents", "upstream.lock.json"]) {
      await cp(join(repository, path), join(fixture, path), {
        recursive: true,
        filter: source => !source.split("/").includes("node_modules"),
      });
    }
    return await run(fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

for (const [label, references, expectedStatus] of [
  ["sibling skills and bundled files", ["skill://how", "skill://no-comments", "skill://poteto-mode/playbooks/bug-fix.md"], 0],
  ["nested sibling skill", ["skill://poteto-mode/how"], 1],
  ["nested sibling reference", ["skill://poteto-mode/references/how"], 1],
  ["nested review skill", ["skill://poteto-mode/no-comments"], 1],
  ["unknown skill", ["skill://missing-skill"], 1],
  ["directory instead of file", ["skill://poteto-mode/references"], 1],
  ["escaping the skill directory", ["skill://poteto-mode/../../README.md"], 1],
]) {
  test(`verify ${expectedStatus === 0 ? "accepts" : "rejects"} ${label}`, async () => {
    await withVerifyFixture(async fixture => {
      await writeFile(join(fixture, "skills/poteto-mode/uri-fixture.md"), references.map((uri) => `Read \`${uri}\`.`).join("\n"));
      const result = spawnSync(process.execPath, [join(fixture, "scripts/verify.mjs")], { encoding: "utf8" });
      assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
    });
  });
}

for (const [label, target, version] of [
  ["invalid fork SemVer", "fork", "not-semver"],
  ["invalid source SemVer", "source", "01.2.3"],
  ["non-string source version", "source", ["0.15.13"]],
  ["missing source version", "source", undefined],
]) {
  test(`verify rejects ${label}`, async () => {
    await withVerifyFixture(async fixture => {
      const paths = target === "fork"
        ? ["package.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]
        : ["upstream.lock.json"];
      for (const path of paths) {
        const destination = join(fixture, path), manifest = JSON.parse(await readFile(destination, "utf8"));
        if (version === undefined) delete manifest.version;
        else manifest.version = version;
        await writeFile(destination, JSON.stringify(manifest));
      }
      const result = spawnSync(process.execPath, [join(fixture, "scripts/verify.mjs")], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
    });
  });
}
