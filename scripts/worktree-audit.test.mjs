import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve(import.meta.dirname, "../skills/poteto-mode/scripts/worktree-audit.sh");

for (const forge of ["gh", "origin"]) {
  for (const scenario of ["closed", "reused", "merged history", "truncated", "invalid JSON", "invalid state", "multiple documents", "null head", "missing head", "empty head", "uppercase open", "landed"]) {
    test(`worktree audit preserves ${forge} ${scenario} branch evidence`, async () => {
      const root = await mkdtemp(join(tmpdir(), "pstack-audit-"));
      const repo = join(root, "repo"), worktree = join(root, "feature"), bin = join(root, "bin");
      const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", repo, ...args], { stdio: "pipe" });
      try {
        await mkdir(repo);
        await mkdir(bin);
        git("init", "-b", "main");
        git("-c", "user.name=Audit test", "-c", "user.email=audit@example.invalid", "commit", "--allow-empty", "-m", "base");
        git("worktree", "add", "-b", "feature", worktree);
        git("-C", worktree, "-c", "user.name=Audit test", "-c", "user.email=audit@example.invalid", "commit", "--allow-empty", "-m", "unmerged");
        if (!["closed", "reused", "merged history", "truncated"].includes(scenario)) git("merge", "--ff-only", "feature");
        const rows = [{ number: 1, state: scenario === "merged history" ? "MERGED" : "CLOSED", headRefName: "feature" }];
        if (scenario === "reused") rows.push({ number: 2, state: "OPEN", headRefName: "feature" });
        if (scenario === "truncated") {
          for (let number = 2; number <= 1000; number++) rows.push({ number, state: "CLOSED", headRefName: "other" });
        }
        const data = join(root, "prs.json");
        if (scenario === "invalid state") rows[0].state = null;
        if (scenario === "uppercase open") rows[0].state = "OPEN";
        if (scenario === "null head") rows[0].headRefName = null;
        if (scenario === "missing head") delete rows[0].headRefName;
        if (scenario === "empty head") rows[0].headRefName = "";
        const payload = (values) => JSON.stringify(forge === "origin"
          ? values.map(({ state, headRefName, ...row }) => ({ ...row, status: state, headRef: headRefName })) : values);
        let raw = scenario === "invalid JSON" ? "not-json" : payload(rows);
        if (scenario === "multiple documents") raw = payload([{ number: 2, state: "OPEN", headRefName: "feature" }]) + "\n" + raw;
        await writeFile(data, raw);
        for (const cli of ["gh", "origin"]) {
          await writeFile(join(bin, cli), cli === forge ? '#!/bin/sh\ncat "$PSTACK_AUDIT_PRS"\n' : "#!/bin/sh\nexit 1\n");
        }
        await chmod(join(bin, "origin"), 0o755);
        await chmod(join(bin, "gh"), 0o755);
        const result = spawnSync("bash", [script, "-b", "main", repo], {
          encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PSTACK_AUDIT_PRS: data },
        });
        if (["truncated", "invalid JSON", "invalid state", "multiple documents", "null head", "missing head", "empty head"].includes(scenario)) {
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, /invalid|truncated/u);
          assert.equal(result.stdout, "");
        } else if (scenario === "uppercase open") {
          assert.equal(result.status, 0, result.stderr);
          assert.match(result.stdout, /#1\/open\thold-open-pr/u);
        } else if (scenario === "landed") {
          assert.equal(result.status, 0, result.stderr);
          assert.match(result.stdout, /\tsafe\t/u);
        } else {
          assert.equal(result.status, 0, result.stderr);
          assert.doesNotMatch(result.stdout, /\tsafe\t/u);
          assert.match(result.stdout, scenario === "reused" ? /#2\/open\thold-open-pr/u : /\treview\t/u);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

}
