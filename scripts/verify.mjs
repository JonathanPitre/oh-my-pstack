import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const skillsRoot = join(root, "skills");
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const requiredSkills = new Set([
  "architect",
  "arena",
  "automate-me",
  "benchmark-checklist",
  "blast-radius",
  "bro",
  "correct",
  "create-verification-skill",
  "figure-it-out",
  "how",
  "interrogate",
  "maintain-verification-skill",
  "make-bot-ui",
  "no-comments",
  "poteto-mode",
  "pstack-pi",
  "recall",
  "reflect",
  "setup-pstack",
  "show-me-your-work",
  "swarm",
  "tdd",
  "teach",
  "technical-writing",
  "typescript-best-practices",
  "unslop",
  "why",
  "reproduce-and-fix-issues",
  "setup-benny",
  "triage-issue-reports",
  "principle-attack-the-premise",
  "principle-test-behavior-not-implementation",
  "principle-boundary-discipline",
  "principle-build-the-lever",
  "principle-encode-lessons-in-structure",
  "principle-explain-the-number",
  "principle-exhaust-the-design-space",
  "principle-experience-first",
  "principle-fix-root-causes",
  "principle-foundational-thinking",
  "principle-guard-the-context-window",
  "principle-laziness-protocol",
  "principle-make-operations-idempotent",
  "principle-migrate-callers-then-delete-legacy-apis",
  "principle-minimize-reader-load",
  "principle-model-the-domain",
  "principle-never-block-on-the-human",
  "principle-outcome-oriented-execution",
  "principle-prove-it-works",
  "principle-redesign-from-first-principles",
  "principle-separate-before-serializing-shared-state",
  "principle-sequence-verifiable-units",
  "principle-subtract-before-you-add",
  "principle-type-system-discipline",
]);

const failures = [];
const packageManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const canonicalRoot = await realpath(root);
const canonicalSkillsRoot = await realpath(skillsRoot);
const shippedRoots = ["package.json", ...(packageManifest.files ?? [])].map(path => resolve(root, path));
const contains = (directory, path) => {
  const suffix = relative(directory, path);
  return !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`);
};
const shipped = path => !relative(root, path).split(sep).includes("node_modules")
  && shippedRoots.some(directory => contains(directory, path));
async function validateFile(path, boundary) {
  if (!contains(boundary, path)) throw new Error("target escapes its reference boundary");
  const canonicalBoundary = await realpath(boundary);
  if (!contains(canonicalRoot, canonicalBoundary)) throw new Error("reference boundary escapes the package");
  if (boundary !== root && !contains(canonicalSkillsRoot, canonicalBoundary)) throw new Error("reference boundary escapes the skills tree");
  const canonicalPath = await realpath(path);
  if (!contains(canonicalBoundary, canonicalPath)) throw new Error("target symlink escapes its reference boundary");
  if (!(await stat(canonicalPath)).isFile()) throw new Error("target is not a file");
  if (!shipped(path) || !shipped(canonicalPath)) throw new Error("target is not declared for the package");
}
const skillDirs = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const name of requiredSkills) {
  const path = join(skillsRoot, name, "SKILL.md");
  try {
    await validateFile(path, skillsRoot);
    const source = await readFile(path, "utf8");
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
    if (!/^name:\s*\S+/mu.test(frontmatter)) {
      failures.push(`${relative(root, path)} is missing frontmatter name`);
    }
    if (!/^description:\s*\S+/mu.test(frontmatter)) {
      failures.push(`${relative(root, path)} is missing frontmatter description`);
    }
  } catch {
    failures.push(`missing ${relative(root, path)}`);
  }
}

const markdownFiles = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith(".md")) markdownFiles.push(path);
  }
};
await collect(skillsRoot);
for (const path of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "assets/logo.png", "agents/poteto-agent.md", "agents/comment-sicko.md", "docs/upstream-compatibility-design.md"]) {
  try { await validateFile(join(root, path), root); }
  catch (error) { failures.push(`${path}: ${error.message}`); }
}
for (const path of new Set(["README.md", "THIRD_PARTY_NOTICES.md", ...(packageManifest.files ?? []).filter(path => path.endsWith(".md"))])) {
  markdownFiles.push(resolve(root, path));
}

for (const path of markdownFiles) {
  let source;
  try {
    await validateFile(path, path.startsWith(`${skillsRoot}${sep}`) ? skillsRoot : root);
    source = await readFile(path, "utf8");
  } catch (error) {
    failures.push(`${relative(root, path)}: ${error.message}`);
    continue;
  }
  for (const match of source.matchAll(/skill:\/\/([a-z0-9-]+)(\/[^\s`"'<>()[\]#]*)?/gu)) {
    const skillRoot = join(skillsRoot, match[1]);
    try {
      const targetPath = resolve(skillRoot, decodeURIComponent(match[2]?.slice(1) || "SKILL.md"));
      await validateFile(targetPath, skillRoot);
    } catch {
      failures.push(`${relative(root, path)} references invalid ${match[0]}`);
    }
  }
  const prose = source.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gmu, "");
  const targets = [
    ...Array.from(prose.matchAll(/\]\(([^)#][^)]*)\)/gu), match => match[1]),
    ...Array.from(prose.matchAll(/^ {0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gmu), match => match[1]),
    ...Array.from(prose.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/giu), match => match[1]),
  ];
  for (const reference of targets) {
    const target = (reference.startsWith("<") ? reference.slice(1, reference.indexOf(">")) : reference.split(/\s/u, 1)[0]).split(/[?#]/u, 1)[0];
    if (!target || /^https?:\/\//iu.test(target) || target.startsWith("skill://")) continue;
    try {
      const targetPath = resolve(path, "..", decodeURIComponent(target));
      await validateFile(targetPath, path.startsWith(`${skillsRoot}${sep}`) ? skillsRoot : root);
    } catch (error) {
      failures.push(`${relative(root, path)} references invalid ${target}: ${error.message}`);
    }
  }
}

for (const path of [
  join(root, ".claude-plugin", "plugin.json"),
  join(root, ".codex-plugin", "plugin.json"),
  join(root, "upstream.lock.json"),
]) {
  try {
    JSON.parse(await readFile(path, "utf8"));
  } catch {
    failures.push(`${relative(root, path)} is not valid JSON`);
  }
}

try {
  const requiredKeywords = [
    "pi-package",
    "pstack",
    "agent-skills",
    "coding-agent",
    "claude-code",
    "codex",
  ];
  if (packageManifest.name !== "pstack-pi") {
    failures.push("package.json does not use the pstack-pi package name");
  }
  if (!packageManifest.pi?.skills?.includes("./skills")) {
    failures.push("package.json does not expose ./skills through the pi manifest");
  }
  if (requiredKeywords.some((keyword) => !packageManifest.keywords?.includes(keyword))) {
    failures.push("package.json is missing discoverability keywords");
  }
  const claudeManifest = JSON.parse(
    await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8")
  );
  if (claudeManifest.name !== "pstack-pi") {
    failures.push(".claude-plugin/plugin.json does not use the pstack-pi name");
  }
  const codexManifest = JSON.parse(
    await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8")
  );
  if (codexManifest.name !== "pstack-pi" || codexManifest.skills !== "./skills/") {
    failures.push(".codex-plugin/plugin.json has incorrect package identity or skills path");
  }
  const manifestVersions = [packageManifest.version, claudeManifest.version, codexManifest.version];
  if (manifestVersions.some(version => typeof version !== "string" || !SEMVER.test(version))) {
    failures.push("package and plugin manifests require valid fork SemVer strings");
  }
  if (new Set(manifestVersions).size !== 1) {
    failures.push(`package and plugin manifests disagree on version: ${manifestVersions.join(", ")}`);
  }
  const claudeMarketplace = JSON.parse(
    await readFile(join(root, ".claude-plugin", "marketplace.json"), "utf8")
  );
  if (
    claudeMarketplace.name !== "oh-my-pstack" ||
    claudeMarketplace.owner?.name !== "JonathanPitre" ||
    claudeMarketplace.plugins?.length !== 1 ||
    claudeMarketplace.plugins[0]?.name !== "pstack-pi" ||
    claudeMarketplace.plugins[0]?.source !== "./"
  ) {
    failures.push(".claude-plugin/marketplace.json has incorrect marketplace or package identity");
  }
  const codexMarketplace = JSON.parse(
    await readFile(join(root, ".agents", "plugins", "marketplace.json"), "utf8")
  );
  const codexPlugin = codexMarketplace.plugins?.[0];
  if (
    codexMarketplace.name !== "oh-my-pstack" ||
    codexMarketplace.interface?.displayName !== "oh-my-pstack" ||
    codexMarketplace.plugins?.length !== 1 ||
    codexPlugin?.name !== "pstack-pi" ||
    codexPlugin.source?.source !== "local" ||
    codexPlugin.source?.path !== "./"
  ) {
    failures.push(".agents/plugins/marketplace.json has incorrect marketplace or package identity");
  }
  for (const path of [
    join(root, ".claude-plugin", "plugin.json"),
    join(root, ".codex-plugin", "plugin.json"),
    skillsRoot,
  ]) {
    try {
      await stat(path);
    } catch {
      failures.push(`marketplace source is missing ${relative(root, path)}`);
    }
  }
  if (
    !packageManifest.files?.includes(".agents/plugins") ||
    !codexPlugin?.policy ||
    codexPlugin.policy.installation !== "AVAILABLE" ||
    codexPlugin.policy.authentication !== "ON_INSTALL" ||
    codexPlugin.category !== "Productivity"
  ) {
    failures.push("Codex marketplace source or policy metadata is incomplete");
  }
  const upstreamLock = JSON.parse(
    await readFile(join(root, "upstream.lock.json"), "utf8")
  );
  if (
    upstreamLock.repository !== "https://github.com/cursor/plugins.git" ||
    upstreamLock.ref !== "main" ||
    !/^[0-9a-f]{40}$/u.test(upstreamLock.commit) ||
    typeof upstreamLock.version !== "string" ||
    !SEMVER.test(upstreamLock.version) ||
    !Array.isArray(upstreamLock.sourceRoots)
  ) {
    failures.push("upstream.lock.json is missing an authoritative pinned source");
  }
} catch {
  // The JSON parse and existence failures above provide the actionable report.
}

const forbidden = [
  "~/.cursor/",
  ".cursor/skills/",
  ".cursor/plugins/",
  "subagent_type:",
  "AskQuestion",
  "environment: \"cloud\"",
  "claude-fable-5-thinking-max",
  "claude-fable-5-1-thinking-max",
  "gpt-5.6-sol-max",
  "grok-4.6-fast-xhigh",
  "claude-opus-5-thinking-xhigh",
];
for (const path of markdownFiles) {
  if (!path.startsWith(`${skillsRoot}${sep}`)) continue;
  const source = await readFile(path, "utf8");
  for (const token of forbidden) {
    if (source.includes(token)) {
      failures.push(`${relative(root, path)} contains forbidden runtime binding ${token}`);
    }
  }
}

const expectedSkillCount = requiredSkills.size;
if (skillDirs.length < expectedSkillCount) {
  failures.push(`expected at least ${expectedSkillCount} skill directories, found ${skillDirs.length}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`verified ${skillDirs.length} skill directories and ${markdownFiles.length} markdown files`);
}
