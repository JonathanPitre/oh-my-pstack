---
name: setup-pstack
description: Configure which host-supported roles, models, and reasoning budgets pstack uses per workflow role. Detects the live host inventory and writes portable project-local configuration. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's role choices.
---

# Setup pstack

Follow the [portable runtime contract](../pstack-pi/references/runtime.md) throughout this setup.

Write the optional pstack configuration at `$PSTACK_CONFIG` when that variable is set; otherwise use `.pstack/config.md` in the current project. This is an override layer, not a requirement. Never write to a vendor-specific home directory.

## Steps

Model discovery and model assignment are different capabilities. A model listed by
`pi --list-models` is available to the current Pi process, but that does not mean a
workflow can send work to it. Per-role assignment also requires a host task or
subagent facility that accepts a model choice. Native Pi intentionally does not
include subagents. Do not claim that a role was assigned when that facility is
absent.

### Pi delegation prerequisite

For native Pi, recommend the maintained `pi-subagents` package when the user wants
parallel workers or per-role models:

```bash
pi install npm:pi-subagents
```

Tell the user to restart Pi after installation, then run `/subagents-doctor`.
Continue setup only when the `subagent` tool and the expected agents are visible.
The package supplies the delegation facility; it does not choose pstack's model
policy by itself.

### OpenCode delegation prerequisite

OpenCode has its own native primary and subagent agents. Do not install
`pi-subagents` or write Pi-specific settings when the current host is OpenCode.
Use the agents and concrete `provider/model-id` choices reported by OpenCode, and
keep their model configuration in the host's `opencode.json` or
`opencode.jsonc`. If OpenCode does not expose a usable subagent, report that
limitation instead of substituting a Pi-specific mechanism.

### OMP delegation prerequisite

OMP already exposes native `task` agents and a per-item `model` field. Do not
install `pi-subagents`, write `.pi/settings.json`, or modify global OMP settings.
Use the live task schema, available-command catalog, and confirmed
`provider/model` selectors. When `task.enableEffort` is false, omit `effort` and
keep a supported thinking selector in the model value.

### 1. Detect available choices

Detect these capabilities independently:

1. The model IDs the current host actually exposes.
2. Whether the current host exposes a task or subagent facility that can select a
   model for each child.
3. Whether that facility accepts a separate reasoning effort or exposes model variants
   with documented effort levels. Record only the supported values and mappings.

For Pi, `pi --list-models` is the model inventory and the `provider/model-id` form
is the concrete value to record. With `pi-subagents` installed, the `subagent`
tool and `/subagents-doctor` establish the delegation inventory. The live host
inventory is authoritative. Never copy a vendor slug from prose or guess that a
model is available. On OMP, the live `task` schema and confirmed model inventory
are authoritative; do not use Pi's `get_commands` or invent a hidden effort field.

If the host has a task facility but cannot enumerate models, use only a host role
mapping that the facility documents. Do not ask the user to invent a raw slug.
`inherit-parent` is valid only when the host can pass the current model to a child.

When the live task schema exposes a per-item `model` field, record that OMP and
compatible hosts can assign a model per child. Do not omit or forbid that field
to compensate for a stale example. When `task.enableEffort` is false, do not
record or dispatch a hidden `effort` field; keep a supported thinking selector
in the model value, such as `provider/model:low`.

### 2. Load current state

Read the selected configuration path when it exists and treat its concrete values
as current choices. Read its `# budget` line and any per-role reasoning entries too.
Preserve explicit model families, panel lists, and supported aliases on reruns.
If it contains only portable role aliases from a host without
per-child delegation, treat those aliases as stale inactive state and start from
the detected models instead of carrying them into Pi's agent overrides.
A line whose role is not in the current role table, such as `how critics`, is a
retired role. Drop it.

### 3. Budget, map, and confirm

Once per-child selection is available, ask for a reasoning budget. Name the current
budget when the configuration records one. Offer these choices through the host's
structured interaction tool when available; the root owns the question:

- `unlimited`. Keep the current reasoning levels, including max where supported.
- `large`. Target xhigh reasoning.
- `medium`. Target high reasoning.
- `small`. Target medium reasoning.

Apply the budget to the current role table, including each panel entry. Preserve
model families, panel membership, and supported aliases. `unlimited` preserves the
current efforts. The other budgets select the highest supported effort at or below
the target on the ladder `max` > `xhigh` > `high` > `medium` > `low`.

Use a separate reasoning argument only when the host's child facility exposes it.
If the host encodes reasoning in model IDs, select only detected IDs whose family
and effort mapping the host documents. Never construct a model ID by changing a
suffix. Leave `inherit-parent` and other documented aliases unchanged.

When no supported effort meets a target, mark the role as needing a choice. If
the host exposes no reasoning control, report that limitation and preserve its
model choices. Do not record an applied budget or reasoning override in that case.
A budget is a reasoning preference, not a monetary limit.

If both model inventory and per-child model selection are available, show every
workflow role with its current concrete `provider/model-id` choice and supported
reasoning level. Distinguish applied efforts from host defaults. Mark an
explicit model absent from the live inventory as needing a replacement. Also list
each line step 2 dropped. Ask the user to accept or change the choices, offering
only detected model IDs and `inherit-parent` when supported. Use the host's
structured interaction tool when available; otherwise the root asks one focused
question in normal conversation.

If the host exposes models but no task or subagent facility, stop model mapping
with an explicit capability report. For native Pi, recommend
`pi install npm:pi-subagents`, a restart, and `/subagents-doctor`. For OpenCode,
explain that its native agents are not visible or configured and point the user
to the host's agent configuration. For OMP, name the missing live `task` schema
or model inventory without installing Pi packages. For any other host, name the missing
capability without proposing a vendor-specific substitute. Say that no pstack
role can receive a different model in this session and do not present the
portable defaults as an assignment or overwrite an existing role configuration
with inactive aliases.

For panel roles (`arena runners`, `architect runners`, and `interrogate reviewers`), one child runs per entry, so list length controls fan-out. `arena cross-judge pool` is a list of candidates for one judge. Arena selects one entry, preferring a different model family from the parent when returned resolved-model metadata demonstrates it. Prefer diversity for judgment-sensitive panels. `swarm workers` is the default choice for every worker unless a race or comparison assigns a different choice per arm.

### 4. Validate

Every explicit model written must be present in the detected host inventory.
Every reasoning override must be supported by that model and the host's child
facility. Validate each panel entry. Do not treat an unsupported budget as applied.
Role aliases pass only when the host task facility documents those aliases.
`inherit-parent` passes only when the host can pass the current model to a child. If
a selected explicit model is unavailable, or a reasoning value is unsupported,
stop, report both rejected choices, and ask for a replacement. Never
write a configuration that requires another host. Never write a guessed vendor
slug, silently substitute a model, or dispatch a child to work around an invalid
choice. On OMP, write only the selected project configuration, typically
`.pstack/config.md`; do not create `.pi/settings.json` or modify global
settings.

### 5. Write the configuration

When the host supports per-child selection, create the parent directory when
needed and overwrite the selected file so re-runs remain idempotent. Preserve
unrelated existing lines that are still valid, including comments and
non-role configuration, unless the user asked to replace them. Preserve the
confirmed role choices and record the applied budget as `# budget: <label> (<target>)`.
For `unlimited`, record `# budget: unlimited (keep current efforts)`. Omit the budget
line if the host has no reasoning control. When the host accepts separate reasoning
arguments, add `<workflow role> reasoning: <effort>` entries. Panel reasoning lists
must match the model list in length and order, using `host-default` for entries
without an explicit effort. Keep those entries out of model ID values. Use concrete
detected model IDs in this shape. Replace every placeholder with a model the
current host reported, and use `inherit-parent` only when the host supports it.
Panel examples below have three seats, matching current upstream defaults; keep a
user's longer or shorter confirmed list. A confirmed one-entry panel is one
participant, not an implicit three-seat default:

```md
# pstack role and model configuration
# Values are concrete provider/model-id choices confirmed by the host.
feature, refactoring: <implementer-model>
bug-fix: <implementer-model>
perf-issue: <implementer-model>
hillclimb: <implementer-model>
judgment and prose: <reviewer-model>
hardest tasks: inherit-parent
how explorer: <explorer-model>
how explainer: <synthesizer-model>
why investigators: <researcher-model>
why synthesizer: <synthesizer-model>
reflect tooling: <researcher-model>
reflect judgment: <reviewer-model>
reflect divergent: <divergent-model>
reflect synthesizer: <synthesizer-model>
arena runners: <planner-model>, <reviewer-model>, inherit-parent
arena cross-judge pool: <reviewer-model>, <planner-model>, inherit-parent
swarm workers: <implementer-model>
architect runners: <planner-model>, <reviewer-model>, inherit-parent
interrogate reviewers: <reviewer-model>, <planner-model>, inherit-parent
```

For Pi with `pi-subagents`, also preserve unrelated keys and update the project's
`.pi/settings.json` with the concrete model assignments for the discovered
subagent names. Use this mapping unless the user chooses different agents:

| pstack role | pi-subagents agent |
| --- | --- |
| `explorer`, `watcher` | `scout` |
| `researcher` | `researcher` |
| `implementer`, `mechanical` | `worker` |
| `reviewer` | `reviewer` |
| `planner`, `synthesizer` | `oracle` |
| `owner` | `delegate` |

Write the selected IDs under `subagents.agentOverrides.<agent>.model`:

```json
{
  "subagents": {
    "agentOverrides": {
      "scout": { "model": "<explorer-model>" },
      "researcher": { "model": "<researcher-model>" },
      "worker": { "model": "<implementer-model>" },
      "reviewer": { "model": "<reviewer-model>" },
      "oracle": { "model": "<planner-model>" },
      "delegate": { "model": "<owner-model>" }
    }
  }
}
```

Write host-specific reasoning settings only when the detected host facility
documents the field and confirms support for the selected model. A model inventory
alone does not establish reasoning support.

For OpenCode, do not write `.pi/settings.json`. Keep the concrete model choices in
the user's existing `opencode.json` or `opencode.jsonc`, and use the live
OpenCode agent names in the pstack role map. Preserve unrelated configuration.

For OMP, do not write `.pi/settings.json` or global `config.yml`. Keep confirmed
role choices in the selected project configuration, typically `.pstack/config.md`,
and route children through the live task schema. Preserve unrelated existing
lines. Confirm the project save with the host's structured ask tool.

### 6. Confirm

If a concrete configuration was written, tell the user the exact path and list
the model IDs and applied reasoning efforts assigned to each role family. State
any unsupported budget choices and any roles that retain host defaults. List any
retired lines that were dropped. For Pi, name both `.pstack/config.md`
and `.pi/settings.json`, and tell the user to run `/subagents-models` to inspect
the live mapping. For OpenCode, name the `opencode.json` or `opencode.jsonc`
path used. For OMP, name the selected project configuration path only. State that
configuration does not create models, child agents, permissions, or
delegation facilities.

If the host lacks per-child model selection, report that no role configuration was
written or activated. Tell the user which model is active and how to switch the
single Pi session model.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof, such as a `verify-*` skill or an existing harness. If not, offer once to invoke the sibling **create-verification-skill** skill. On no, move on without pushing.
