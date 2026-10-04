---
name: pstack-pi
description: "Pi and Oh My Pi runtime adapter for poteto-mode. Maps canonical pstack roles and lifecycle protocols to the live host's agents, model routing, batching, isolation, and result resources."
---

# pstack on Pi and Oh My Pi

Read the [portable runtime contract](references/runtime.md) before delegation, including its model selection and reasoning-budget rules.

`poteto-mode` is the sole router. It selects the playbook, canonical role, step order, and lifecycle protocol. This adapter translates those choices. It does not change a playbook gate. The live host's instructions, agent inventory, and tool schema remain authoritative.

## Canonical role map

Map a role's behavior to an available agent, not its label to an invented agent name.

| Canonical role | OMP mapping | Contract |
|---|---|---|
| `explorer` | `scout` | Read-only repository reconnaissance and trace reduction. |
| `watcher` | `scout` | Observe one exact state transition, then terminate. |
| `planner` | `designer` when available, otherwise `task` with a technical-planning brief | Architecture, decomposition, and sequencing. |
| `designer` | `designer` when available, otherwise `task` with a design brief | Product, interaction, or alternative design candidates. |
| `reviewer` | `reviewer` | Independent code, protocol, or behavioral review. |
| `researcher` | `librarian` when available, otherwise an available read-only research facility | Source-verified external documentation and API research. |
| `synthesizer` | `reviewer` | Adjudicate frozen evidence without changing it. |
| `implementer` | `task` | Bounded implementation with explicit write ownership. |
| `owner` | `task` | Own one PR lifecycle; the role can outlive an individual session. |
| `mechanical` | `sonic` | Fully specified low-judgment edits. |

Use `security-reviewer` for an independent security lane when it is available. A later synthesizer does not replace that review.

Canonical roles and model aliases are not concrete agent names. For the general-purpose default, omit `agent` when the live schema requires omission. `poteto-agent` and `comment-sicko` are direct named compatibility seams only when the host exposes them; they are not the default canonical routing.

The imported warning about a planning subagent concerns a source-host mechanism that bypasses the skill contract. Technical planning through a supported agent with a standalone brief is valid. Native Pi still needs an actual child-delegation facility; a model list does not supply one.

## Task contract

The root performs every child start. Children do not start children or ask the user directly. Put these restrictions in each brief.

Children start without the parent conversation. Give each one its goal, canonical role and mapped agent, writable and forbidden paths, repository and base revision, frozen evidence pointers, acceptance criteria, verification responsibility, output paths, report format, and the active standing policy.

Use the actual tool schema. OMP versions may expose a flat task or a `tasks[]` batch. Pass only fields the current schema supports. When batch mode is exposed, put shared immutable context in `context` and each independent slice in a separate item with a unique name. Start independent participants together within the host's concurrency limit. Preserve required lane coverage across waves when the limit is smaller than the panel.

Separate writers through supported isolation or structurally disjoint paths. A writer that needs a dedicated worktree receives an explicit workspace path; use an isolation flag only when the host exposes it. Freeze candidates before review and reviewer reports before synthesis.

## Results and follow-ups

Record the returned agent and job identifiers. Consume asynchronous results when delivered; a preview may be truncated. Read the full result and transcript through the resources the host actually exposes. OMP may provide `agent://<id>` and `history://<id>`.

Use the live messaging, cancellation, and wait facilities. Some versions expose a hub; others expose resource writes, process controls, or dedicated tools. Do not invent a `hub` operation. Keep working while independent work remains and wait only when blocked. Ignore duplicate terminal deliveries and reject stale generations.

Use fresh sessions by default for new work, fix rounds, retries, and the next queue item. Supply the original brief, later directives, prior report, and branch as needed. Retain or resume a session only when the work needs costly live state it still owns, such as uncommitted changes, its checkout, a running server, simulator, or watcher. A stop order to a running agent is not session reuse.

A child report is evidence, not verification. The root inspects the artifact and runs the checks assigned to it. Report checks as unrun when they were deferred to the parent. Never steer a reviewer toward a preferred conclusion.

## Canonical protocols

### Bounded session

1. Write a standalone brief for one unit and role.
2. Start the mapped available agent and record its scope, base revision, and output generation.
3. Consume its full result and inspect the artifact.
4. Use an in-scope correction only when preserving necessary live state; otherwise start a fresh session with consolidated context.
5. Independently verify the unit before accepting it.

A role or unit change requires a fresh session.

### Panel

1. Partition independent slices or race arms with one participant per assignment.
2. Start the panel within the live concurrency limit, using one batch where supported.
3. Track participants by name and identifiers, not arrival order.
4. Obtain every required result or report the missing lane. Do not represent unavailable coverage as complete.
5. Freeze artifacts and exact generations, then start independent reviewers in fresh sessions.
6. Freeze verdicts before a separate synthesis session when needed.
7. The root selects, integrates, and verifies. Judges advise.

### Long-lived owner

The owner role persists through a PR lifecycle; this does not require one permanent agent session.

1. Assign one owner role to one branch and writable slice.
2. Start a fresh session for each returned round unless costly live state requires retention.
3. Give each round the complete brief, branch, prior report, accepted findings, and authorization.
4. Owners may execute their assigned CLI watch/fix loop. The root starts independent watchers and verifiers; owners do not spawn children.
5. Require the exact head and evidence at every verification boundary. Independently verify before authorizing the next round or merge.
6. Stand down immediately on an operator hold, stale generation, scope breach, or ownership violation.

### One-shot watcher

1. Start a read-only available watcher with the exact branch, head, generation, watched predicate, and stop predicate.
2. Require one meaningful event and a terminal report.
3. Reject a report whose generation no longer matches.
4. Start a fresh watcher for each new generation; cancel superseded work through the exposed host facility.

A watcher observes. It does not fix, merge, authorize, or silently follow a changed head.

## Interactions and ownership

Children resolve uncertainty from source, standing policy, frozen evidence, or the brief. Otherwise they report the safest reversible assumption or the exact unavailable prerequisite. The root resolves child questions and owns user interaction.

One writer owns each mutable output. A new commit, restack, resolution, or applied patch invalidates verdicts for the old generation. The root owns external writes, merges, deletion, and final verification. Judges and synthesizers advise.

## Model routing

Agent and model selection are separate. OMP can route through agent definitions, configured roles, or agent overrides. When the current task schema exposes a per-item `model` field, use it for a verified configured panel or role choice. When it does not, use the host's supported routing configuration rather than adding an unsupported field. Do not edit user settings merely to compensate for a stale skill example.

Use only selectors and reasoning controls confirmed by the live inventory and tool schema. `inherit-parent` and `auto` mean to omit an explicit model choice when the host supports that behavior. Honor the host's explicit rejection and fallback policy; report an unavailable requested choice instead of silently substituting a guessed model. Claim model independence only when returned resolved-model metadata demonstrates it.

## Writing

Apply `unslop` to replies, briefs, reports, reviews, commits, and agent-facing edits. Use the installed `writing-for-agents` guidance for skill changes.
