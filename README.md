# oh-my-pstack

<img src="assets/logo.png" alt="pstack logo" width="128">

Portable, rigorous engineering workflows for [OMP](https://omp.sh/), Pi,
[OpenCode](https://opencode.ai/), Claude Code, Codex, and other hosts that support
the Agent Skills layout.

`oh-my-pstack` is a universal port of the original
[Cursor pstack](https://github.com/cursor/plugins/tree/main/pstack). It keeps the
upstream workflow catalog, playbooks, principles, references, and verification
scripts while replacing Cursor-only runtime assumptions with a host-neutral
adapter.

## Start here

1. [Install the plugin for your host](#install).
2. Start a fresh session and run `$setup-pstack`.
3. Route substantial work through `$poteto-mode`, for example:

   ```text
   $poteto-mode add a small feature and prove it works end to end
   ```

The shared skills stay host-neutral. The adapter uses capabilities exposed by the
active host and reports unavailable integrations instead of claiming they work.

## What is included

- 50 upstream pstack skills and their supporting references.
- Benny's three fail-closed issue-triage/reproduction skills.
- `poteto-mode` for routing work through the right playbook.
- `make-bot-ui` for connecting a local UI to an available webhook automation.
- `pstack-pi` for translating roles, delegation, models, transcripts, questions,
  and long-running work to the active host.
- Native package metadata for OMP/Pi, Claude Code, and Codex, plus OpenCode setup
  guidance.
- Daily upstream synchronization that opens a verified pull request.

The original Cursor repository is the content authority. The dsebban repository
was used only as an early structural example; it is not an upstream source.

## Install

### Pi

```bash
pi install https://github.com/JonathanPitre/oh-my-pstack
```

Start Pi and confirm the package with `pi list`. Review the source before installing;
Pi packages run with full system access. Update with `pi update --extensions`, or
remove with `pi remove https://github.com/JonathanPitre/oh-my-pstack`.

For parallel workers and per-role model assignments, install Pi's separate
delegation extension:

```bash
pi install npm:pi-subagents
```

Restart Pi and run `/subagents-doctor`. The extension provides the `subagent` tool
and built-in `scout`, `researcher`, `worker`, `reviewer`, `oracle`, and `delegate`
agents. Native Pi does not include subagents.

### OMP

```bash
omp install https://github.com/JonathanPitre/oh-my-pstack
```

Confirm the enabled plugin with `omp plugin list --json`, then verify that the skills
load with `omp read skill://setup-pstack` and `omp read skill://poteto-mode`.
For local development, link a checkout with
`omp plugin link /absolute/path/to/oh-my-pstack`; alternatively run
`omp --plugin-dir /absolute/path/to/oh-my-pstack`.

Named skills use a flat namespace. Load `how` with `omp read skill://how` and
`no-comments` with `omp read skill://no-comments`. A suffix addresses a file inside
that skill, such as `skill://poteto-mode/playbooks/bug-fix.md`; it does not address
a sibling skill.

### OpenCode

OpenCode loads Agent Skills from `.opencode/skills/` in a project or
`~/.config/opencode/skills/` globally. For global installation:

```bash
git clone https://github.com/JonathanPitre/oh-my-pstack.git \
  ~/.local/share/oh-my-pstack
mkdir -p ~/.config/opencode/skills
cp -R ~/.local/share/oh-my-pstack/skills/. ~/.config/opencode/skills/
```

Confirm with `opencode debug skill`. To update, pull and repeat the copy:

```bash
git -C ~/.local/share/oh-my-pstack pull --ff-only
cp -R ~/.local/share/oh-my-pstack/skills/. ~/.config/opencode/skills/
```

For project-local installation:

```bash
git clone https://github.com/JonathanPitre/oh-my-pstack.git .pstack-source
mkdir -p .opencode/skills
cp -R .pstack-source/skills/. .opencode/skills/
```

Run `opencode debug skill` from that project. OpenCode already provides primary
and subagents; configure their models through `opencode.json` or `opencode.jsonc`.

### Claude Code

```bash
claude plugin marketplace add JonathanPitre/oh-my-pstack
claude plugin install pstack-pi@oh-my-pstack
claude plugin list --json
claude plugin details pstack-pi
```

### Codex

```bash
codex plugin marketplace add JonathanPitre/oh-my-pstack
codex plugin add pstack-pi@oh-my-pstack
codex plugin list --json
```

After installation, Codex loads the plugin's skills through its app server and
`skills/list`; start a fresh session to use them.

### Gemini CLI

Review the repository before granting consent: skills are trusted instructions
that can influence the agent.

```bash
gemini skills install https://github.com/JonathanPitre/oh-my-pstack \
  --scope user --path skills --consent
gemini skills list --all
```

### Updating an installed OMP package

Upstream synchronization updates this repository through reviewed pull requests.
It does not publish releases or update users' installations.

`omp plugin upgrade pstack-pi` re-resolves the Git or npm source/ref already
recorded by OMP; it does not automatically check for updates at startup or on a
schedule. A pinned tag remains pinned, while an unpinned branch is not limited to
stable releases. `omp update` updates OMP itself, not this plugin.

No stable releases are published yet, so stable-release-only updates are not
available.

## First-time setup

After installing, start a fresh agent session in the project you want to work on.
Run the setup skill once:

```text
$setup-pstack
```

It detects the roles and models your host actually exposes, asks for a reasoning
budget, and lets you choose the defaults for implementation and review work when
the host supports per-child model selection. Budget choices are unlimited, large, medium, and small. They preserve current
efforts or target xhigh, high, and medium reasoning, respectively. Existing role choices stay in place unless you change them. The adapter
applies only reasoning levels or model variants that the host actually supports. On a task-capable host, it writes concrete
`provider/model-id` assignments to `.pstack/config.md` (or to `$PSTACK_CONFIG`
when set). Native Pi can list and switch the single active model, but it does not
include subagents. Install `pi-subagents`, restart Pi, and run
`/subagents-doctor` before setup if you want role assignments. Setup then writes
the pstack role map and Pi's `subagents.agentOverrides` with concrete model IDs.
Without the extension, setup reports the limitation instead of pretending that
role assignments are active. Switch Pi's single active model with `/model` or
`pi --model provider/model-id`.

Then route your first real task through the main workflow:

```text
$poteto-mode add a small feature and prove it works end to end
```

The setup skill may offer to create a project verification skill when the project
has no existing way to exercise the real application. Accept that offer when you
want repeatable behavioral proof; otherwise setup finishes without changing the
project. Read `skills/setup-pstack/SKILL.md` for the complete setup contract.

## Automatic upstream updates

`.github/workflows/upstream-sync.yml` checks the original pstack `main` branch
every six hours at minute 17 and can also be started manually. The pinned baseline
lives in `upstream.lock.json`.

The updater:

1. Fetches the latest upstream revision.
2. Normalizes known Cursor runtime bindings for portable hosts.
3. Updates only upstream-owned files.
4. Preserves OMP adapters and protected portability adaptations.
5. Sets `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json`
   to the upstream `pstack` plugin version at the imported commit so the portable
   package number tracks sync state with Cursor pstack.
6. Stops before writing if an adapted file changed upstream, unless a bound review
   supplies an explicit per-conflict write or delete.
7. Runs verification, updater tests, Bun tests, and strict TypeScript checking only
   when the update changes managed files, the pin, or the portable version.
8. Opens a pull request and squash-merges it only after validation and exact-tree,
   PR-head, and unchanged-main checks pass.

Skill links into upstream `pstack/docs/` are rewritten to public GitHub URLs
pinned to the imported commit because this package does not bundle those docs.
The updater checks that each target exists in that upstream revision before
writing; links between bundled skills remain local.

The workflow uses Ubuntu 26.04 and the latest Node 26 patch. Its JavaScript
actions use Node 24 independently of the Node version selected for scripts.
Action releases are pinned to commit hashes. Bun's existing package typecheck
script uses the installed compiler rather than downloading one through `bunx`.

Exit code 2 is a reconciliation rejection, not a Node or Ubuntu version error.
Resolve the listed file conflicts with `--export-review` before another update
can advance the pin. Runtime upgrades do not resolve conflicting instructions.

Run it locally:

```bash
npm run sync:check
npm run sync:apply -- --dry-run
npm run sync:export-review -- /tmp/pstack-review
# resolve every conflict in that directory, then:
npm run sync:apply -- --review /tmp/pstack-review --dry-run
npm run sync:apply -- --review /tmp/pstack-review
```

Protected adaptation changes require an explicit review decision. The updater never
silently overwrites them. Ordinary clean updates stay planner-owned.

## Development and verification

```bash
npm run verify
npm run test:verify
npm run test:sync
bun install --cwd skills/poteto-mode/scripts --frozen-lockfile
bun test orch watch-pr
bun run --cwd skills/poteto-mode/scripts typecheck
```

`npm run verify` checks skill inventory, frontmatter, local references, `skill://`
targets, manifests, the upstream lock, and forbidden vendor-specific runtime
bindings. Skill resource targets must resolve to files within their named skill.

The separate installation release gate requires OMP, Pi, OpenCode, Claude Code,
Codex, Gemini CLI, Git, and outbound package/GitHub access:

```bash
npm run test:install
PSTACK_INSTALL_SOURCE=https://github.com/JonathanPitre/oh-my-pstack npm run test:install
npm pack --dry-run --json --ignore-scripts
```

The first run installs an isolated copy of this checkout; the second uses the
public repository without local overlays. A local directory can also be supplied
as `PSTACK_INSTALL_SOURCE`. Each host receives a disposable HOME/project and
temporary XDG roots. The suite checks absence before installation, native skill
discovery, the installed skill inventory where exposed, and repeat installation;
missing hosts and discovery failures fail rather than skip.

Use `PSTACK_OMP_BIN`, `PSTACK_PI_BIN`, `PSTACK_OPENCODE_BIN`, `PSTACK_CLAUDE_BIN`,
`PSTACK_CODEX_BIN`, and `PSTACK_GEMINI_BIN` to select direct installed executables.
Avoid tool-manager wrappers that change global configuration. Each test reports
its executable, version, and source, and checks live registration/configuration
files remain unchanged. Publish the candidate catalogs before expecting the
public Claude/Codex marketplace checks to pass. This gate is intentionally
separate from upstream synchronization; it neither provisions hosts nor submits
model prompts.

## Host support and install checks

The plugin uses each host's native skill loading path. Runtime behavior follows the
host's live capabilities, not a fixed list of agent or model names.

The coverage column lists cases in the install test suite. It does not report a
recent test run.

| Host | Install skills | Delegation and model configuration | `test:install` coverage |
| --- | --- | --- | --- |
| OMP | `omp install` or a local plugin link | Maps roles to capabilities exposed by OMP. | Yes |
| Pi | `pi install` | Native Pi has no subagents. Optional `pi-subagents` adds child delegation and per-role model assignments. | Yes |
| OpenCode | Copy skills into the project or user skill directory. | Uses native agents and model settings in `opencode.json` or `opencode.jsonc`. | Global and project |
| Claude Code | Install from the Claude marketplace. | Maps roles to capabilities exposed by the active session. | Yes |
| Codex | Install from the Codex marketplace. | Maps roles to capabilities exposed by the active session. | Yes |
| Gemini CLI | Install the skills with `gemini skills install`. | Maps roles to capabilities exposed by the active session. | Yes |

The `test:install` suite checks isolated installation, skill discovery, inventory
where the host exposes it, repeat installation, and unchanged live configuration.
It does not prove that every workflow or delegation path works in a live task. The
runtime rules and host limits are documented in the
[portable runtime contract](skills/pstack-pi/references/runtime.md).

## Upstream compatibility

Cursor pstack is the content source. The updater records the source revision,
protects local adaptations, and requires review for conflicts. See the
[upstream reconciliation design](docs/upstream-compatibility-design.md) for its
review and stale-input rules.

## License and attribution

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.

The pstack-derived material is adapted from Lauren Tan's original work in
`cursor/plugins`. See `THIRD_PARTY_NOTICES.md` for attribution and license text.
