import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";

const repository = resolve(import.meta.dirname, "..");

async function skillInventory(root) {
  const files = [];
  const collect = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".npmignore") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  };
  await collect(join(root, "skills"));
  return files.sort();
}

test("the real npm artifact ships the complete skills and rejects lost installed resources", { timeout: 180_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "pstack-package-"));
  try {
    const result = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
      cwd: repository,
      encoding: "utf8",
      timeout: 90_000,
      env: { ...process.env, npm_config_cache: join(directory, "cache") },
    }));
    const [packed] = Array.isArray(result) ? result : Object.values(result);
    execFileSync("tar", ["-xzf", join(directory, packed.filename), "-C", directory], { timeout: 30_000 });
    const installed = join(directory, "package");
    const verify = () => spawnSync(process.execPath, [join(installed, "scripts/verify.mjs")], { cwd: installed, encoding: "utf8", timeout: 30_000 });
    const valid = verify();
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    assert.deepEqual(await skillInventory(installed), await skillInventory(repository));
    for (const path of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "assets/logo.png", "agents/poteto-agent.md", "agents/comment-sicko.md", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json", "upstream.lock.json", "docs/upstream-compatibility-design.md"]) {
      assert.ok((await stat(join(installed, path))).isFile(), `missing installed resource: ${path}`);
    }
    assert.ok(!packed.files.some(file => file.path.startsWith("docs/superpowers/") || file.path.startsWith(".superpowers/")), "private execution history must not ship");
    await rm(join(installed, "skills/poteto-mode/playbooks/bug-fix.md"));
    const incomplete = verify();
    assert.notEqual(incomplete.status, 0, "an installed workflow with a lost playbook must be rejected");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
