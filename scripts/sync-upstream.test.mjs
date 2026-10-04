import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { normalizeContent } from "./sync-upstream.mjs";

test("normalization removes supported Cursor bindings, including absolute paths", () => {
  const source = [
    "config: ~/.cursor/rules/pstack-models.mdc",
    "config: /home/alice/.cursor/rules/pstack-models.mdc",
    "config: C:\\Users\\alice\\.cursor\\rules\\pstack-models.mdc",
    "agent: Task subagent",
    "question: AskQuestion",
    "model: claude-fable-5-thinking-max",
    "model: claude-fable-5-1-thinking-max",
  ].join("\n");

  const normalized = normalizeContent(source);

  assert.doesNotMatch(normalized, /(?:~|\/home\/alice|C:\\Users\\alice)\\?\.cursor/u);
  assert.equal((normalized.match(/\$PSTACK_CONFIG/g) ?? []).length, 3);
  assert.match(normalized, /host task runner/u);
});

test("normalization removes the supported Cursor runtime bindings", () => {
  const source = [
    "config: ~/.cursor/rules/pstack-models.mdc",
    "agent: Task subagent",
    "question: AskQuestion",
    "model: claude-fable-5-thinking-max",
    "model: claude-fable-5-1-thinking-max",
  ].join("\n");

  const normalized = normalizeContent(source);

  assert.doesNotMatch(normalized, /~\/\.cursor\/|AskQuestion|claude-fable/u);
  assert.match(normalized, /\$PSTACK_CONFIG/u);
  assert.match(normalized, /host task runner/u);
});


test("apply reconciles independent edits in adapted files", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-merge-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    await mkdir(join(source, "pstack/skills/adapted"), { recursive: true });
    await mkdir(join(target, "skills/adapted"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: source });
    const base = [
      "local-region base",
      "context one",
      "context two",
      "context three",
      "context four",
      "context five",
      "context six",
      "context seven",
      "context eight",
      "context nine",
      "upstream-region base",
      "~/.cursor/rules/pstack-models.mdc",
      "",
    ].join("\n");
    await writeFile(join(source, "pstack/skills/adapted/SKILL.md"), base);
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: source });
    const pinned = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    await writeFile(join(source, "pstack/skills/adapted/SKILL.md"), [
      "local-region base",
      "context one",
      "context two",
      "context three",
      "context four",
      "context five",
      "context six",
      "context seven",
      "context eight",
      "context nine",
      "upstream-region changed",
      "~/.cursor/rules/pstack-models.mdc",
      "",
    ].join("\n"));
    execFileSync("git", ["commit", "-qam", "upstream"], { cwd: source });
    const latest = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    await writeFile(join(target, "upstream.lock.json"), JSON.stringify({
      repository: "fixture",
      ref: "main",
      commit: pinned,
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      protectedPaths: [],
      protectedPrefixes: ["skills/adapted/"],
    }));
    await writeFile(join(target, "skills/adapted/SKILL.md"), [
      "local-region adapted",
      "context one",
      "context two",
      "context three",
      "context four",
      "context five",
      "context six",
      "context seven",
      "context eight",
      "context nine",
      "upstream-region base",
      "$PSTACK_CONFIG (or .pstack/config.md)",
      "",
    ].join("\n"));
    await writeFile(join(target, "skills/adapted/OMP.md"), "local only\n");
    const originalAdapted = await readFile(join(target, "skills/adapted/SKILL.md"), "utf8");
    const originalLock = await readFile(join(target, "upstream.lock.json"), "utf8");
    const dryRun = spawnSync(process.execPath, [
      new URL("./sync-upstream.mjs", import.meta.url).pathname,
      "--apply", "--dry-run", "--source", source,
    ], { encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target } });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Would update skills\/adapted\/SKILL\.md/u);
    assert.equal(await readFile(join(target, "skills/adapted/SKILL.md"), "utf8"), originalAdapted);
    assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), originalLock);
    const result = spawnSync(process.execPath, [
      new URL("./sync-upstream.mjs", import.meta.url).pathname,
      "--apply", "--source", source,
    ], { encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target } });
    const merged = await readFile(join(target, "skills/adapted/SKILL.md"), "utf8");
    assert.match(merged, /local-region adapted/u);
    assert.match(merged, /upstream-region changed/u);
    assert.match(merged, /\$PSTACK_CONFIG/u);
    assert.equal(await readFile(join(target, "skills/adapted/OMP.md"), "utf8"), "local only\n");
    assert.equal(JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8")).commit, latest);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
for (const scenario of ["divergent edit", "add/add", "upstream delete/local edit", "local delete/upstream edit"]) {
  test(`apply rejects adapted ${scenario} without applying other files`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-conflict-"));
    const source = join(fixture, "source");
    const target = join(fixture, "target");
    const sourcePath = "pstack/skills/private/SKILL.md";
    const adaptedPath = "skills/private/SKILL.md";
    const managedPath = "skills/public/SKILL.md";
    const git = (...args) => execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
    try {
      await mkdir(join(source, "pstack/skills/private"), { recursive: true });
      await mkdir(join(source, "pstack/skills/public"), { recursive: true });
      await mkdir(join(target, "skills/private"), { recursive: true });
      await mkdir(join(target, "skills/public"), { recursive: true });
      await writeFile(join(source, sourcePath), "base\n");
      await writeFile(join(source, "pstack", managedPath), "managed base\n");
      git("init", "-q", "-b", "main");
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "pstack test");
      git("add", ".");
      git("commit", "-q", "-m", "baseline");
      const baseline = git("rev-parse", "HEAD");
      if (scenario === "upstream delete/local edit") {
        await rm(join(source, sourcePath));
      } else {
        await writeFile(join(source, sourcePath), scenario === "divergent edit"
          ? "upstream edit\n"
          : scenario === "local delete/upstream edit" ? "upstream edit\n" : "base\n");
      }
      if (scenario === "add/add") await writeFile(join(source, "pstack/skills/private/new.md"), "upstream addition\n");
      await writeFile(join(source, "pstack", managedPath), "managed update\n");
      git("add", "-A");
      git("commit", "-q", "-m", "upstream");
      const latest = git("rev-parse", "HEAD");
      const localContent = scenario === "divergent edit" ? "local edit\n"
        : scenario === "add/add" ? "local addition\n"
          : scenario === "upstream delete/local edit" ? "local adaptation\n" : null;
      if (localContent !== null) await writeFile(join(target, adaptedPath), localContent);
      await writeFile(join(target, managedPath), "managed base\n");
      if (scenario === "add/add") await writeFile(join(target, "skills/private/new.md"), "local addition\n");
      const originalLock = JSON.stringify({
        repository: "fixture", ref: "main", commit: baseline,
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
        protectedPaths: [], protectedPrefixes: ["skills/private/"],
      });
      await writeFile(join(target, "upstream.lock.json"), originalLock);
      const dryRun = spawnSync(process.execPath, [
        new URL("./sync-upstream.mjs", import.meta.url).pathname,
        "--apply", "--dry-run", "--source", source,
      ], { encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target } });
      assert.equal(dryRun.status, 2, dryRun.stderr);
      assert.equal(await readFile(join(target, managedPath), "utf8"), "managed base\n");
      assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), originalLock);
      if (localContent === null) {
        await assert.rejects(readFile(join(target, adaptedPath)), { code: "ENOENT" });
      } else {
        assert.equal(await readFile(join(target, adaptedPath), "utf8"), localContent);
      }
      const result = spawnSync(process.execPath, [
        new URL("./sync-upstream.mjs", import.meta.url).pathname,
        "--apply", "--source", source,
      ], { encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target } });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /skills\/private/u);
      assert.equal(await readFile(join(target, managedPath), "utf8"), "managed base\n");
      assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), originalLock);
      if (localContent === null) {
        await assert.rejects(readFile(join(target, adaptedPath)), { code: "ENOENT" });
      } else {
        assert.equal(await readFile(join(target, adaptedPath), "utf8"), localContent);
      }
      if (scenario === "add/add") {
        assert.equal(await readFile(join(target, "skills/private/new.md"), "utf8"), "local addition\n");
        assert.doesNotMatch(result.stderr, /<<<<<<<|=======|>>>>>>>/u);
      }
      assert.notEqual(latest, baseline);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
test("apply rejects symlinked destinations before changing any files", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-symlink-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  const external = join(fixture, "external");
  try {
    await mkdir(join(source, "pstack/skills/public"), { recursive: true });
    await mkdir(join(target, "skills"), { recursive: true });
    await mkdir(external);
    await writeFile(join(source, "pstack/skills/public/a.md"), "base\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    await writeFile(join(source, "pstack/skills/public/a.md"), "changed\n");
    await writeFile(join(source, "pstack/skills/public/b.md"), "new\n");
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "update"], { cwd: source });
    await writeFile(join(external, "sentinel"), "untouched\n");
    await symlink(external, join(target, "skills/public"));
    const lock = JSON.stringify({
      repository: "fixture", ref: "main", commit: baseline,
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      protectedPaths: [], protectedPrefixes: [],
    });
    await writeFile(join(target, "upstream.lock.json"), lock);
    const result = spawnSync(process.execPath, [
      new URL("./sync-upstream.mjs", import.meta.url).pathname,
      "--apply", "--source", source,
    ], { encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Symlinked destination path/u);
    assert.equal(await readFile(join(external, "sentinel"), "utf8"), "untouched\n");
    assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), lock);
    assert.deepEqual(await readdir(external), ["sentinel"]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

for (const scenario of ["clean addition", "clean modification", "unchanged upstream", "clean deletion"]) {
  test(`apply handles adapted ${scenario}`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-clean-"));
    const source = join(fixture, "source");
    const target = join(fixture, "target");
    const sourceFile = join(source, "pstack/skills/private/SKILL.md");
    const destination = join(target, "skills/private/SKILL.md");
    const git = (...args) => execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
    try {
      await mkdir(join(source, "pstack/skills/private"), { recursive: true });
      await mkdir(join(source, "pstack/skills/public"), { recursive: true });
      await mkdir(join(target, "skills/private"), { recursive: true });
      await mkdir(join(target, "skills/public"), { recursive: true });
      await writeFile(join(source, "pstack/skills/public/common.md"), "common base\n");
      await writeFile(join(target, "skills/public/common.md"), "common base\n");
      if (scenario !== "clean addition") await writeFile(sourceFile, "base\n");
      git("init", "-q", "-b", "main");
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "pstack test");
      git("add", ".");
      git("commit", "-q", "-m", "baseline");
      const baseline = git("rev-parse", "HEAD");
      await writeFile(join(source, "pstack/skills/public/common.md"), "common incoming\n");
      if (scenario === "clean addition" || scenario === "clean modification") {
        await writeFile(sourceFile, "incoming\n");
      } else if (scenario === "clean deletion") {
        await rm(sourceFile);
      }
      git("add", "-A");
      git("commit", "-q", "-m", "upstream");
      if (scenario === "unchanged upstream") await writeFile(destination, "local adaptation\n");
      else if (scenario !== "clean addition") await writeFile(destination, "base\n");
      const lock = JSON.stringify({
        repository: "fixture", ref: "main", commit: baseline,
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
        protectedPaths: [], protectedPrefixes: ["skills/private/"],
      });
      await writeFile(join(target, "upstream.lock.json"), lock);
      const result = spawnSync(process.execPath, [
        new URL("./sync-upstream.mjs", import.meta.url).pathname,
        "--apply", "--source", source,
      ], { encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target } });
      assert.equal(result.status, 0, result.stderr);
      if (scenario === "clean deletion") {
        await assert.rejects(readFile(destination), { code: "ENOENT" });
      } else {
        const expected = scenario === "unchanged upstream" ? "local adaptation\n" : "incoming\n";
        assert.equal(await readFile(destination, "utf8"), expected);
      }
      assert.notEqual(JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8")).commit, baseline);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}

test("apply updates an upstream-owned file and advances the lock", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    await mkdir(join(source, "pstack/skills/blast-radius"), { recursive: true });
    await mkdir(
      join(source, "pstack/automations/benny/skills/setup-benny"),
      { recursive: true },
    );
    await mkdir(join(target, "skills"), { recursive: true });
    await writeFile(
      join(source, "pstack/skills/blast-radius/SKILL.md"),
      "---\nname: blast-radius\ndescription: source\n---\nagent: Task subagent\n",
    );
    await writeFile(
      join(source, "pstack/automations/benny/skills/setup-benny/SKILL.md"),
      "---\nname: setup-benny\ndescription: protected\n---\n",
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await writeFile(
      join(source, "pstack/skills/blast-radius/SKILL.md"),
      "---\nname: blast-radius\ndescription: updated\n---\nagent: Task subagent\n",
    );
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "update"], { cwd: source });
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        protectedPrefixes: [],
        protectedPaths: ["skills/setup-benny/SKILL.md"],
        sourceRoots: [
          { source: "pstack/skills", destination: "skills" },
          { source: "pstack/automations/benny/skills", destination: "skills" },
        ],
      })}\n`,
    );

    execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target } },
    );

    const synced = await readFile(
      join(target, "skills/blast-radius/SKILL.md"),
      "utf8",
    );
    assert.match(synced, /host task runner/u);
    const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.equal(lock.commit, execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source, encoding: "utf8",
    }).trim());
    const repeated = execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" },
    );
    assert.match(repeated, /No managed skill changes/u);
    assert.equal(await readFile(join(target, "skills/blast-radius/SKILL.md"), "utf8"), synced);
    assert.equal(JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8")).commit, lock.commit);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

for (const change of ["prefix edit", "ordinary deletion", "missing baseline", "dirty protected edit", "untracked addition"]) {
  test(`apply rejects ${change} without changing target files or lock`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-protected-test-"));
    const source = join(fixture, "source");
    const target = join(fixture, "target");
    const protectedPath = "skills/private/SKILL.md";
    const managedPath = "skills/public/SKILL.md";
    const git = (...args) => execFileSync("git", args, {
      cwd: source, encoding: "utf8",
    }).trim();
    try {
      for (const path of [protectedPath, managedPath]) {
        for (const directory of [source, target]) {
          const file = join(directory, directory === source ? "pstack" : ".", path);
          await mkdir(join(file, ".."), { recursive: true });
          await writeFile(file, "baseline content\n");
        }
      }
      git("init", "-q", "-b", "main");
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "pstack test");
      git("add", ".");
      git("commit", "-q", "-m", "baseline");
      const baseline = git("rev-parse", "HEAD");
      if (change === "ordinary deletion") await rm(join(source, "pstack", managedPath));
      else await writeFile(join(source, "pstack", managedPath), "updated managed content\n");
      if (change === "prefix edit") {
        await writeFile(join(source, "pstack", protectedPath), "updated protected content\n");
      } else if (change === "prefix addition") {
        await writeFile(join(source, "pstack/skills/private/new.md"), "new protected content\n");
      } else if (change === "protected deletion") {
        await rm(join(source, "pstack", protectedPath));
      }
      git("add", ".");
      git("commit", "-q", "-m", "update");
      if (change === "dirty protected edit") {
        await writeFile(join(source, "pstack", protectedPath), "uncommitted content\n");
      } else if (change === "untracked addition") {
        await writeFile(join(source, "pstack/skills/public/new.md"), "untracked content\n");
      }
      const originalLock = `${JSON.stringify({
        repository: "local",
        ref: "main",
        commit: change === "missing baseline" ? "0".repeat(40) : baseline,
        protectedPrefixes: change === "protected deletion" ? [] : ["skills/private/"],
        protectedPaths: change === "protected deletion" ? [protectedPath] : [],
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      })}\n`;
      await writeFile(join(target, "upstream.lock.json"), originalLock);
      if (change === "prefix edit") await writeFile(join(target, protectedPath), "local adaptation\n");
      if (change === "ordinary deletion") await writeFile(join(target, managedPath), "local modification\n");
      const result = spawnSync(process.execPath, [
        join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source,
      ], { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" });

      assert.equal(result.status, 2, result.stderr);
      const expectedError = change === "missing baseline"
        ? /baseline.*unavailable/u
        : change === "dirty protected edit" || change === "untracked addition"
          ? /source has uncommitted changes/u
          : change === "ordinary deletion" ? /skills\/public\/SKILL\.md/u : /skills\/private\//u;
      assert.match(result.stderr, expectedError);
      assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), originalLock);
      assert.equal(await readFile(join(target, protectedPath), "utf8"),
        change === "prefix edit" ? "local adaptation\n" : "baseline content\n");
      assert.equal(await readFile(join(target, managedPath), "utf8"),
        change === "ordinary deletion" ? "local modification\n" : "baseline content\n");
      if (change === "prefix addition") {
        await assert.rejects(readFile(join(target, "skills/private/new.md")), { code: "ENOENT" });
      }
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
for (const failure of ["source symlink", "binary content", "invalid UTF-8", "invalid local UTF-8", "duplicate destination"]) {
  test(`apply rejects ${failure} before writing eligible updates`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-source-type-"));
    const source = join(fixture, "source");
    const target = join(fixture, "target");
    try {
      await mkdir(join(source, "pstack/skills/public"), { recursive: true });
      await mkdir(join(target, "skills/public"), { recursive: true });
      const originalContent = failure === "binary content" ? Buffer.from([0, 255])
        : failure === "invalid UTF-8" ? Buffer.from([0xff]) : Buffer.from("baseline\n");
      await writeFile(join(source, "pstack/skills/public/managed.md"), originalContent);
      if (failure === "source symlink") await symlink("managed.md", join(source, "pstack/skills/public/link.md"));
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
      execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
      execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
      execFileSync("git", ["add", "."], { cwd: source });
      execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
      const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
      await writeFile(join(source, "pstack/skills/public/managed.md"), "incoming\n");
      execFileSync("git", ["add", "."], { cwd: source });
      execFileSync("git", ["commit", "-q", "-m", "update"], { cwd: source });
      const targetContent = failure === "invalid local UTF-8" ? Buffer.from([0xff]) : originalContent;
      await writeFile(join(target, "skills/public/managed.md"), targetContent);
      const mapping = { source: "pstack/skills", destination: "skills" };
      const lock = JSON.stringify({
        repository: "fixture", ref: "main", commit: baseline,
        sourceRoots: failure === "duplicate destination" ? [mapping, mapping] : [mapping],
        protectedPaths: [], protectedPrefixes: [],
      });
      await writeFile(join(target, "upstream.lock.json"), lock);
      const result = spawnSync(process.execPath, [
        new URL("./sync-upstream.mjs", import.meta.url).pathname,
        "--apply", "--source", source,
      ], { encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target } });
      assert.equal(result.status, 1);
      const diagnostic = failure === "source symlink" ? /Unsupported upstream source type/u
        : failure === "binary content" ? /Binary upstream content/u
          : failure === "invalid UTF-8" ? /Invalid UTF-8 upstream content/u
            : failure === "invalid local UTF-8" ? /Invalid UTF-8 destination content/u
              : /Duplicate upstream destination/u;
      assert.match(result.stderr, diagnostic);
      assert.deepEqual(await readFile(join(target, "skills/public/managed.md")), targetContent);
      assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), lock);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
test("apply repairs drift only in upstream-managed files at the same pin", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-drift-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  const git = (...args) => execFileSync("git", args, {
    cwd: source, encoding: "utf8",
  }).trim();
  try {
    await mkdir(join(source, "pstack/skills/managed"), { recursive: true });
    await mkdir(join(target, "skills/managed"), { recursive: true });
    await writeFile(join(source, "pstack/skills/managed/SKILL.md"), "upstream content\n");
    await writeFile(join(target, "skills/managed/SKILL.md"), "locally edited\n");
    await writeFile(join(target, "skills/my-local-skill.md"), "local-only content\n");
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "pstack test");
    git("add", ".");
    git("commit", "-q", "-m", "baseline");
    const baseline = git("rev-parse", "HEAD");
    await writeFile(join(target, "upstream.lock.json"), `${JSON.stringify({
      repository: "local",
      ref: "main",
      path: "pstack",
      commit: baseline,
      protectedPrefixes: [],
      protectedPaths: [],
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
    })}\n`);

    const result = spawnSync(process.execPath, [
      join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source,
    ], { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(target, "skills/managed/SKILL.md"), "utf8"), "upstream content\n");
    assert.equal(await readFile(join(target, "skills/my-local-skill.md"), "utf8"), "local-only content\n");
    assert.equal(JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8")).commit, baseline);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("apply advances the pin when a newer commit has no managed content changes", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-no-change-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  const git = (...args) => execFileSync("git", args, {
    cwd: source, encoding: "utf8",
  }).trim();
  try {
    await mkdir(join(source, "pstack/skills/managed"), { recursive: true });
    await mkdir(join(target, "skills/managed"), { recursive: true });
    await writeFile(join(source, "pstack/skills/managed/SKILL.md"), "same content\n");
    await writeFile(join(target, "skills/managed/SKILL.md"), "same content\n");
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "pstack test");
    git("add", ".");
    git("commit", "-q", "-m", "baseline");
    const baseline = git("rev-parse", "HEAD");
    await writeFile(join(source, "unmanaged.txt"), "unmanaged change\n");
    git("add", ".");
    git("commit", "-q", "-m", "unmanaged change");
    const latest = git("rev-parse", "HEAD");
    await writeFile(join(target, "upstream.lock.json"), `${JSON.stringify({
      repository: "local",
      ref: "main",
      path: "pstack",
      commit: baseline,
      protectedPrefixes: [],
      protectedPaths: [],
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
    })}\n`);

    const result = spawnSync(process.execPath, [
      join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source,
    ], { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8")).commit, latest);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function reviewFixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "pstack-review-test-"));
  const source = join(directory, "source");
  const target = join(directory, "target");
  const review = join(directory, "review");
  const git = (...args) => execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
  const cli = (...args) => spawnSync(process.execPath, [
    new URL("./sync-upstream.mjs", import.meta.url).pathname, ...args, "--source", source,
  ], { encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target } });
  const put = async (directory, path, text) => {
    await mkdir(join(directory, path, ".."), { recursive: true });
    await writeFile(join(directory, path), text);
  };
  try {
    await put(source, "pstack/skills/private/a.md", "base\n");
    await put(source, "pstack/skills/public/a.md", "clean base\n");
    await put(target, "skills/private/a.md", "local\n");
    await put(target, "skills/public/a.md", "clean base\n");
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Review test");
    git("config", "user.email", "review@example.invalid");
    git("add", "."); git("commit", "-qm", "base");
    const baseline = git("rev-parse", "HEAD");
    await put(source, "pstack/skills/private/a.md", "incoming\n");
    await put(source, "pstack/skills/public/a.md", "clean incoming\n");
    git("add", "."); git("commit", "-qm", "incoming");
    const lock = JSON.stringify({
      repository: "fixture", ref: "main", commit: baseline,
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      protectedPaths: [], protectedPrefixes: ["skills/private/"],
    });
    await writeFile(join(target, "upstream.lock.json"), lock);
    const untouched = async () => {
      assert.equal(await readFile(join(target, "skills/private/a.md"), "utf8"), "local\n");
      assert.equal(await readFile(join(target, "skills/public/a.md"), "utf8"), "clean base\n");
      assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), lock);
    };
    const exportReview = async () => {
      const result = cli("--export-review", review);
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(await readFile(join(review, "manifest.json"), "utf8"));
    };
    const save = manifest => writeFile(join(review, "manifest.json"), JSON.stringify(manifest));
    const approve = async (manifest, content = "resolved\n", kind = "write") => {
      const entry = manifest.entries.find(entry => entry.path === "skills/private/a.md");
      entry.decision = { kind, reason: "Retain host adaptation and incorporate upstream intent." };
      if (kind === "write") await writeFile(join(review, "entries", entry.id, "resolved.txt"), content);
      await save(manifest);
    };
    await run({ directory, source, target, review, git, cli, put, lock, untouched, exportReview, save, approve });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("review export and reviewed dry-run leave all destination inputs untouched", async () => {
  await reviewFixture(async ({ exportReview, approve, cli, review, untouched }) => {
    const manifest = await exportReview();
    await untouched();
    await approve(manifest);
    const result = cli("--apply", "--review", review, "--dry-run");
    assert.equal(result.status, 0, result.stderr);
    await untouched();
  });
});

test("review applies mixed clean and approved conflicts and validates complete replay", async () => {
  await reviewFixture(async ({ exportReview, approve, cli, review, target, source, git, put }) => {
    await approve(await exportReview());
    assert.equal(cli("--apply", "--review", review).status, 0);
    assert.equal(await readFile(join(target, "skills/private/a.md"), "utf8"), "resolved\n");
    assert.equal(await readFile(join(target, "skills/public/a.md"), "utf8"), "clean incoming\n");
    assert.equal(cli("--apply", "--review", review).status, 0);
    await put(target, "skills/public/a.md", "replay drift\n");
    assert.notEqual(cli("--apply", "--review", review).status, 0);
    assert.equal(await readFile(join(target, "skills/public/a.md"), "utf8"), "replay drift\n");
    assert.equal(cli("--apply").status, 0);
    await put(source, "pstack/skills/private/a.md", "later overlap\n");
    git("add", "."); git("commit", "-qm", "later");
    assert.equal(cli("--apply").status, 2);
    assert.notEqual(cli("--apply", "--review", review).status, 0);
    assert.equal(await readFile(join(target, "skills/private/a.md"), "utf8"), "resolved\n");
  });
});

test("review requires explicit approval even when resolution keeps local bytes", async () => {
  await reviewFixture(async ({ exportReview, approve, cli, review, untouched }) => {
    const manifest = await exportReview();
    assert.notEqual(cli("--apply", "--review", review).status, 0);
    await untouched();
    await approve(manifest, "local\n");
    assert.equal(cli("--apply", "--review", review).status, 0);
  });
});

for (const kind of ["empty write", "delete", "add/add", "delete/modify", "modify/delete"]) {
  test(`review preserves explicit ${kind} shape`, async () => {
    await reviewFixture(async ({ source, target, git, put, exportReview, approve, cli, review }) => {
      if (kind === "add/add") {
        git("checkout", "HEAD~1", "--", "pstack/skills/private/a.md");
        await rm(join(source, "pstack/skills/private/a.md"));
        git("add", "-A"); git("commit", "-qm", "remove");
        const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
        lock.commit = git("rev-parse", "HEAD");
        await writeFile(join(target, "upstream.lock.json"), JSON.stringify(lock));
        await put(source, "pstack/skills/private/a.md", "new upstream\n");
      } else if (kind === "delete/modify") {
        await rm(join(source, "pstack/skills/private/a.md"));
      } else if (kind === "modify/delete") {
        await rm(join(target, "skills/private/a.md"));
        await put(source, "pstack/skills/private/a.md", "new upstream\n");
      }
      if (["add/add", "delete/modify", "modify/delete"].includes(kind)) {
        git("add", "-A"); git("commit", "-qm", "shape");
      }
      await approve(await exportReview(), kind === "empty write" ? "" : "resolved\n", kind === "delete" ? "delete" : "write");
      const result = cli("--apply", "--review", review);
      assert.equal(result.status, 0, result.stderr);
      if (kind === "delete") await assert.rejects(readFile(join(target, "skills/private/a.md")), { code: "ENOENT" });
      else assert.equal(await readFile(join(target, "skills/private/a.md"), "utf8"), kind === "empty write" ? "" : "resolved\n");
    });
  });
}

for (const mutation of ["local", "source", "lock", "mode", "implementation", "omitted", "duplicate", "unknown", "path", "reason", "markers", "NUL", "UTF8", "snapshot", "symlink"]) {
  test(`review rejects ${mutation} drift or unsafe input before writes`, async () => {
    await reviewFixture(async ({ directory, exportReview, approve, save, cli, review, target, source, git, put, lock }) => {
      const manifest = await exportReview();
      await approve(manifest);
      const entry = manifest.entries.find(entry => entry.path === "skills/private/a.md");
      const resolved = join(review, "entries", entry.id, "resolved.txt");
      if (mutation === "local") await put(target, "skills/private/a.md", "stale\n");
      if (mutation === "source") { await put(source, "pstack/skills/public/a.md", "new revision\n"); git("add", "."); git("commit", "-qm", "new revision"); }
      if (mutation === "lock") {
        const parsed = JSON.parse(lock);
        parsed.protectedPrefixes = ["skills/other/"];
        await writeFile(join(target, "upstream.lock.json"), JSON.stringify(parsed));
      }
      if (mutation === "mode") execFileSync("chmod", ["755", join(target, "skills/private/a.md")]);
      if (mutation === "implementation") manifest.implementation = "tampered";
      if (mutation === "omitted") manifest.entries = manifest.entries.filter((item) => item.path !== "skills/private/a.md");
      if (mutation === "duplicate") manifest.entries.push(manifest.entries[0]);
      if (mutation === "unknown") manifest.entries.push({ ...entry, path: "skills/unknown.md", id: "999999" });
      if (mutation === "path") entry.id = "../../../escape";
      if (mutation === "reason") entry.decision.reason = " ";
      if (mutation === "markers") await writeFile(resolved, "<<<<<<< ours\nx\n=======\ny\n>>>>>>> theirs\n");
      if (mutation === "NUL") await writeFile(resolved, Buffer.from([0]));
      if (mutation === "UTF8") await writeFile(resolved, Buffer.from([255]));
      if (mutation === "snapshot") await writeFile(join(review, "entries", entry.id, "base.txt"), "tampered\n");
      if (mutation === "symlink") { await rm(resolved); await symlink(join(target, "skills/private/a.md"), resolved); }
      await save(manifest);
      const before = await readFile(join(target, "skills/private/a.md"));
      const beforeLock = await readFile(join(target, "upstream.lock.json"));
      const result = cli("--apply", "--review", review);
      assert.notEqual(result.status, 0, result.stderr);
      assert.deepEqual(await readFile(join(target, "skills/private/a.md")), before);
      assert.equal(await readFile(join(target, "skills/public/a.md"), "utf8"), "clean base\n");
      assert.deepEqual(await readFile(join(target, "upstream.lock.json")), beforeLock);
      if (mutation === "path") await assert.rejects(readFile(join(directory, "escape")), { code: "ENOENT" });
    });
  });
}

test("review export writes numbered snapshot artifacts without destination writes", async () => {
  await reviewFixture(async ({ exportReview, review, untouched }) => {
    const manifest = await exportReview();
    await untouched();
    const conflict = manifest.entries.find((entry) => entry.path === "skills/private/a.md");
    const clean = manifest.entries.find((entry) => entry.path === "skills/public/a.md");
    assert.match(conflict.id, /^\d+$/u);
    assert.match(clean.id, /^\d+$/u);
    assert.notEqual(conflict.id, clean.id);
    assert.equal(await readFile(join(review, "entries", conflict.id, "base.txt"), "utf8"), "base\n");
    assert.equal(await readFile(join(review, "entries", conflict.id, "local.txt"), "utf8"), "local\n");
    assert.equal(await readFile(join(review, "entries", conflict.id, "incoming.txt"), "utf8"), "incoming\n");
    assert.equal(typeof await readFile(join(review, "entries", conflict.id, "proposal.txt"), "utf8"), "string");
  });
});

test("review substitute diagnostic names export-review for unresolved apply", async () => {
  await reviewFixture(async ({ cli, untouched }) => {
    const result = cli("--apply");
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /--export-review/u);
    assert.doesNotMatch(result.stderr, /Resolve conflicts manually before rerunning --apply/u);
    await untouched();
  });
});

test("review rejects decisions that override ordinary clean planner results", async () => {
  await reviewFixture(async ({ exportReview, approve, save, cli, review, target, lock }) => {
    const manifest = await exportReview();
    await approve(manifest);
    const clean = manifest.entries.find((entry) => entry.path === "skills/public/a.md");
    clean.decision = { kind: "write", reason: "Override a clean upstream-owned update." };
    await writeFile(join(review, "entries", clean.id, "resolved.txt"), "hijacked\n");
    await save(manifest);
    const result = cli("--apply", "--review", review);
    assert.notEqual(result.status, 0, result.stderr);
    assert.equal(await readFile(join(target, "skills/public/a.md"), "utf8"), "clean base\n");
    assert.equal(await readFile(join(target, "skills/private/a.md"), "utf8"), "local\n");
    assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), lock);
  });
});

test("review rejects mixed destination state and names the restore contract", async () => {
  await reviewFixture(async ({ exportReview, approve, cli, review, target, lock }) => {
    await approve(await exportReview());
    await writeFile(join(target, "skills/public/a.md"), "clean incoming\n");
    const result = cli("--apply", "--review", review);
    assert.notEqual(result.status, 0, result.stderr);
    assert.match(result.stderr, /disposable worktree|isolated checkout/u);
    assert.doesNotMatch(result.stderr, /git reset|--force|re-pin|repin/u);
    assert.equal(await readFile(join(target, "skills/private/a.md"), "utf8"), "local\n");
    assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), lock);
  });
});

test("review replay allows lock commit movement and rejects other lock-config drift", async () => {
  await reviewFixture(async ({ exportReview, approve, cli, review, target }) => {
    await approve(await exportReview());
    assert.equal(cli("--apply", "--review", review).status, 0);
    const lockPath = join(target, "upstream.lock.json");
    assert.equal(cli("--apply", "--review", review).status, 0);
    const after = JSON.parse(await readFile(lockPath, "utf8"));
    after.protectedPrefixes = ["skills/other/"];
    await writeFile(lockPath, `${JSON.stringify(after, null, 2)}\n`);
    const drifted = cli("--apply", "--review", review);
    assert.notEqual(drifted.status, 0, drifted.stderr);
    assert.equal(await readFile(join(target, "skills/private/a.md"), "utf8"), "resolved\n");
  });
});

test("review default file:// acquisition replays only with fetchable original base and incoming objects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pstack-review-origin-"));
  const source = join(directory, "source");
  const origin = join(directory, "origin.git");
  const target = join(directory, "target");
  const review = join(directory, "review");
  const put = async (root, path, text) => {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  };
  try {
    await put(source, "pstack/skills/private/a.md", "base\n");
    await put(source, "pstack/skills/public/a.md", "clean base\n");
    await put(target, "skills/private/a.md", "local\n");
    await put(target, "skills/public/a.md", "clean base\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.name", "Review test"], { cwd: source });
    execFileSync("git", ["config", "user.email", "review@example.invalid"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    await put(source, "pstack/skills/private/a.md", "incoming\n");
    await put(source, "pstack/skills/public/a.md", "clean incoming\n");
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-qm", "incoming"], { cwd: source });
    const incoming = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    execFileSync("git", ["clone", "--bare", "-q", source, origin]);
    await writeFile(join(target, "upstream.lock.json"), JSON.stringify({
      repository: `file://${origin}`, ref: "main", commit: baseline,
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      protectedPaths: [], protectedPrefixes: ["skills/private/"],
    }));
    const script = new URL("./sync-upstream.mjs", import.meta.url).pathname;
    const run = (...args) => spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8", env: { ...process.env, PSTACK_SYNC_ROOT: target },
    });
    const exported = run("--export-review", review);
    assert.equal(exported.status, 0, exported.stderr);
    const manifest = JSON.parse(await readFile(join(review, "manifest.json"), "utf8"));
    const entry = manifest.entries.find((item) => item.path === "skills/private/a.md");
    entry.decision = { kind: "write", reason: "Retain host adaptation and incorporate upstream intent." };
    await writeFile(join(review, "entries", entry.id, "resolved.txt"), "resolved\n");
    await writeFile(join(review, "manifest.json"), JSON.stringify(manifest));
    const applied = run("--apply", "--review", review);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8")).commit, incoming);
    assert.equal(run("--apply", "--review", review).status, 0);
    await rm(origin, { recursive: true, force: true });
    execFileSync("git", ["clone", "--bare", "-q", "--depth", "1", "--branch", "main", `file://${source}`, origin]);
    const missing = run("--apply", "--review", review);
    assert.notEqual(missing.status, 0, missing.stderr);
    assert.equal(await readFile(join(target, "skills/private/a.md"), "utf8"), "resolved\n");
    assert.equal(JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8")).commit, incoming);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
