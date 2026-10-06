import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repository = resolve(import.meta.dirname, "..");

async function withVerifyFixture(run) {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-verify-"));
  try {
    for (const path of ["skills", "README.md", "package.json", "scripts/verify.mjs", ".claude-plugin", ".codex-plugin", ".agents", "upstream.lock.json", "docs/upstream-compatibility-design.md", "assets", "agents", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
      await cp(join(repository, path), join(fixture, path), {
        recursive: true,
        filter: source => !source.split("/").includes("node_modules"),
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

for (const [label, reference, expectedStatus] of [
  ["a sibling skill Markdown link", "[guide](../how/SKILL.md)", 0],
  ["an encoded bundled URI", "`skill://poteto-mode/playbooks/bug-fix%2Emd`", 0],
  ["an encoded sibling Markdown link", "[guide](../how/SKILL%2Emd)", 0],
  ["an existing target outside the skills tree", "[outside](../../README.md)", 1],
  ["encoded Markdown traversal", "[outside](%2e%2e/%2e%2e/README.md)", 1],
  ["encoded URI traversal", "`skill://poteto-mode/%2e%2e/%2e%2e/README.md`", 1],
  ["a directory Markdown target", "[directory](references)", 1],
  ["reference-style traversal", "[outside][guide]\n\n[guide]: ../../README.md", 1],
  ["a missing reference-style target", "[missing][guide]\n\n[guide]: references/not-present.md", 1],
  ["an encoded reference-style sibling link", "[guide][reference]\n\n[reference]: ../how/SKILL%2Emd", 0],
]) {
  test(`verify ${expectedStatus === 0 ? "accepts" : "rejects"} ${label}`, async () => {
    await withVerifyFixture(async fixture => {
      await writeFile(join(fixture, "skills/poteto-mode/link-fixture.md"), `${reference}\n`);
      const result = spawnSync(process.execPath, [join(fixture, "scripts/verify.mjs")], { encoding: "utf8" });
      assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
    });
  });
}

for (const reference of ["`skill://poteto-mode/escaped.md`", "[outside](escaped.md)"]) {
  test(`verify rejects a resource symlink escape via ${reference.startsWith("`") ? "URI" : "Markdown"}`, async () => {
    await withVerifyFixture(async fixture => {
      await writeFile(join(fixture, "outside.md"), "outside\n");
      await symlink(join(fixture, "outside.md"), join(fixture, "skills/poteto-mode/escaped.md"));
      await writeFile(join(fixture, "skills/poteto-mode/link-fixture.md"), `${reference}\n`);
      const result = spawnSync(process.execPath, [join(fixture, "scripts/verify.mjs")], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
    });
  });
}

test("verify rejects an aliased skill root outside the skills tree", async () => {
  await withVerifyFixture(async fixture => {
    await mkdir(join(fixture, "outside-skill"));
    await writeFile(join(fixture, "outside-skill/SKILL.md"), "outside\n");
    await symlink(join(fixture, "outside-skill"), join(fixture, "skills/aliased-skill"));
    await writeFile(join(fixture, "skills/poteto-mode/link-fixture.md"), "Read `skill://aliased-skill`.\n");
    const result = spawnSync(process.execPath, [join(fixture, "scripts/verify.mjs")], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
  });
});

for (const [label, target, create] of [
  ["an absent README target", "docs/absent.md", false],
  ["an existing but unshipped README target", "docs/unshipped.md", true],
]) {
  test(`verify rejects ${label}`, async () => {
    await withVerifyFixture(async fixture => {
      if (create) await writeFile(join(fixture, target), "not shipped\n");
      const path = join(fixture, "README.md");
      await writeFile(path, `${await readFile(path, "utf8")}\n[reference](${target})\n`);
      const result = spawnSync(process.execPath, [join(fixture, "scripts/verify.mjs")], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
    });
  });
}

test("verify rejects an HTML logo symlink outside the package", async () => {
  const external = await mkdtemp(join(tmpdir(), "pstack-outside-"));
  try {
    await writeFile(join(external, "logo.png"), "outside\n");
    await withVerifyFixture(async fixture => {
      await rm(join(fixture, "assets/logo.png"));
      await symlink(join(external, "logo.png"), join(fixture, "assets/logo.png"));
      const result = spawnSync(process.execPath, [join(fixture, "scripts/verify.mjs")], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
    });
  } finally {
    await rm(external, { recursive: true, force: true });
  }
});
