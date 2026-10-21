# Installation

Git installation from this repository is the supported consumer path. Named skills on OMP use `/skill:<name>`. Resource reads use `skill://<name>` or `skill://<name>/<relative-path>` for a file inside that skill. Other hosts use their own catalogs; `$setup-pstack` is shorthand, not an OMP command.

## Oh My Pi

```bash
omp install https://github.com/JonathanPitre/oh-my-pstack
```

Confirm the enabled plugin with `omp plugin list --json`, then load skills with `omp read skill://setup-pstack` and `omp read skill://poteto-mode`.

For local development, link a checkout with `omp plugin link /absolute/path/to/oh-my-pstack`, or run `omp --plugin-dir /absolute/path/to/oh-my-pstack`.

OMP already exposes native `task` agents. On OMP 18.12.5, ordinary tasks select an agent. Configure its model through native agent frontmatter, `modelRoles`, or `task.agentModelOverrides`. The task `model` field is reserved for historical `seance` consults. Do not install `pi-subagents` or write `.pi/settings.json` for OMP. See [OMP's task routing contract](https://github.com/can1357/oh-my-pi/blob/v18.12.5/docs/task-agent-discovery.md).

### Updating an installed OMP package

Upstream synchronization updates this repository through inspectable pull requests. It does not publish releases or update users' installations, and it does not merge those pull requests automatically.

`omp plugin upgrade pstack-pi` re-resolves the Git or npm source/ref already recorded by OMP. It does not check for updates at startup or on a schedule. A pinned tag remains pinned. An unpinned branch is not limited to stable releases. `omp update` updates OMP itself, not this plugin.

An npm install of `pstack-pi@omp` requires a published version. Adding the release workflow does not publish one.

## Pi

```bash
pi install https://github.com/JonathanPitre/oh-my-pstack
```

Start Pi and confirm the package with `pi list`. Review the source before installing; Pi packages run with full system access. Update with `pi update --extensions`, or remove with `pi remove https://github.com/JonathanPitre/oh-my-pstack`.

Native Pi does not include subagents. For parallel workers and per-role model assignments, install Pi's separate delegation extension:

```bash
pi install npm:pi-subagents
```

Restart Pi and run `/subagents-doctor`. The extension provides the `subagent` tool and built-in `scout`, `researcher`, `worker`, `reviewer`, `oracle`, and `delegate` agents.

## OpenCode

OpenCode loads Agent Skills from `.opencode/skills/` in a project or `~/.config/opencode/skills/` globally. For global installation:

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

Run `opencode debug skill` from that project. OpenCode already provides primary and subagents. Configure their models through `opencode.json` or `opencode.jsonc`. Do not install `pi-subagents` or write Pi settings on OpenCode.

## Cursor, Claude, and Grok

Use the original [Cursor pstack plugin](https://github.com/cursor/plugins/tree/main/pstack) for Cursor, Claude, and Grok workflows. This fork no longer distributes a Claude Code marketplace plugin. Its maintained integration is Oh My Pi.

This removes the Claude Code installation path. OMP can still use Claude or Grok models when its live model inventory and task interface support them.

## Codex

```bash
codex plugin marketplace add JonathanPitre/oh-my-pstack
codex plugin add pstack-pi@oh-my-pstack
codex plugin list --json
```

After installation, Codex loads the plugin's skills through its app server and `skills/list`. Start a fresh session to use them.

## Gemini CLI

Review the repository before granting consent: skills are trusted instructions that can influence the agent.

```bash
gemini skills install https://github.com/JonathanPitre/oh-my-pstack \
  --scope user --path skills --consent
gemini skills list --all
```

## Host coverage

The plugin uses each host's native skill loading path. Runtime behavior follows the host's live capabilities, not a fixed list of agent or model names.

The coverage column lists cases in the install test suite. It does not report a recent test run.

| Host | Install skills | Delegation and model configuration | `test:install` coverage |
| --- | --- | --- | --- |
| OMP | `omp install` or a local plugin link | Maps roles to capabilities exposed by OMP. | Yes |
| Pi | `pi install` | Native Pi has no subagents. Optional `pi-subagents` adds child delegation and per-role model assignments. | Yes |
| OpenCode | Copy skills into the project or user skill directory. | Uses native agents and model settings in `opencode.json` or `opencode.jsonc`. | Global and project |
| Codex | Install from the Codex marketplace. | Maps roles to capabilities exposed by the active session. | Yes |
| Gemini CLI | Install the skills with `gemini skills install`. | Maps roles to capabilities exposed by the active session. | Yes |

`test:install` checks isolated installation, skill discovery, inventory where the host exposes it, repeat installation, and unchanged live configuration. It does not prove that every workflow or delegation path works in a live task. See the [portable runtime contract](../skills/pstack-pi/references/runtime.md).
