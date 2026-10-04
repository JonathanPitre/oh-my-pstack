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
