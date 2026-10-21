# Upstream refresh on 2026-10-21

Refreshed the portable skills to `cursor/plugins` commit
`190d28736eff128ec94f502a22c7fe0c4b56cd37`, whose pstack plugin version is
`0.15.29`. The previous pin was `e5a8186d7b43be8d6ac4452440fbead5f1a51c70`,
version `0.15.13`. The integrated fork version is `0.15.29-omp.1`.

The content refresh was prepared in an isolated worktree based on `5aed139`.
It was then integrated with the separate CI repair and Claude packaging removal.
The verification results below describe that isolated content-refresh stage.

## Recovery and review flow

The earlier delegate's uncommitted draft was recovered read-only from
`/home/johndoe/.t3/worktrees/oh-my-pstack/t3-f7f0ad6f`. Recovery included the
five untracked skills, `check-plan.test.ts`, and the prior conflict recipe.
That recipe was inspected, not executed as the final resolution policy.

A fresh review was exported with this checkout's updater. Its baseline, local,
and incoming state records matched the previous review for every conflict.
The export contained 141 entries, with 41 conflicts, 54 clean writes, and 46
keeps. Recovered resolutions were applied through the existing review command,
then inspected and reconciled against the current upstream structure. The
adapter corrections and additional policy adaptations followed that apply.
The original receipt therefore describes the import step, not an idempotent
replay of all subsequent adapter edits.

```bash
node scripts/sync-upstream.mjs --export-review /tmp/oh-my-pstack-refresh-review-t3-7c3bd8cb --source /tmp/pstack-upstream-target-190d287
node scripts/sync-upstream.mjs --apply --review /tmp/oh-my-pstack-refresh-review-t3-7c3bd8cb --source /tmp/pstack-upstream-target-190d287
```

## Resulting behavior

- Added `create-formal-verification-skill`, `maintain-formal-verification-skill`,
  `in-your-own-words`, `ketchup`, and `sharpen`.
- Adopted the upstream full-swarm-once cadence. A rebase, conflict resolution,
  or minor fix gets one independent verifier. New behavior, a redesign, or a
  large new diff gets another full swarm. The shared plan template agrees.
- Adopted the current stack topology and landing-freeze workflow. The root
  retains sole topology ownership and authorized merging.
- Imported forge-based `orch` frontier discovery, paginated review-thread
  reads, owner-approval gate classification, Markdown fence parsing, and the
  accompanying source tests. The pagination test now uses the local
  `reviewPasses` field rather than the upstream `bugbotReviewPasses` field.
- Added the seed-data journey failure rule, the no-auto-apply interrogate
  verdict, optional formal-verification setup, and max-targeting `unlimited`
  reasoning budgets without inventing model IDs.
- Rebuilt `how` with exactly four upstream stages. Removed duplicate roster
  prose in `why`, repeated finding-shape introductions in all three `reflect`
  prompts, and the transcript-format assumption in `reflect`.
- Preserved root-owned child dispatch, full `agent://` reports, project-local
  `.pstack` preferences, and workspace-scoped transcript discovery. Ordinary
  model routing is resolved through the adapter.
- Added the five required skills and forbidden runtime bindings to the package
  verifier. Protected the localized `ketchup` skill from future blind imports.
- Retained every package manifest, including the nested tools package, unchanged.
  The new fence test is run explicitly in the verification command below.

## Conflict decisions

Each row corresponds to one conflict entry in the fresh export. Nonconflicting
source edits in these files were also inspected. Local retention below means
retaining a specific portability or safety rule, not retaining the whole file.

| Entry | File under `skills/` | Resolution |
| --- | --- | --- |
| 1 | `architect/SKILL.md` | Imported current design guidance. Kept independent candidates and project-configured panels. Replaced schema-presence model routing with the adapter contract. |
| 5 | `arena/SKILL.md` | Kept the upstream six-phase structure. Preserved isolated candidates, an independent frozen-output judge, live model inventory, and explicit missing-seat reporting. |
| 12 | `create-verification-skill/SKILL.md` | Added upstream's seed-precondition failure rule. Kept host-discovered project skill roots and the concrete feature-map index link. |
| 16 | `figure-it-out/SKILL.md` | Kept the phase checklist with the upstream loop and audit sequence. Used a host task tool or project-local fallback. |
| 17 | `how/SKILL.md` | Rebuilt from current upstream. Preserved simple direct explanation versus complex exploration and synthesis. Removed the recovered duplicate synthesis and presentation flow. |
| 19 | `how/references/explorer-prompt.md` | Retained the useful tracing checklist that upstream shortened. File and symbol reads use available host tools. |
| 21 | `interrogate/SKILL.md` | Added upstream's verdict-only, no-auto-apply behavior. Kept live panels and truthful capability gaps instead of source model slugs. |
| 25 | `interrogate/references/rubric.md` | Imported rubric changes and retained host-neutral source inspection. |
| 29 | `make-bot-ui/SKILL.md` | Retained generic webhook automation discovery instead of requiring a Grok Bot. Imported the nonconflicting source change. |
| 30 | `no-comments/SKILL.md` | Preserved specialized-reviewer discovery with a canonical reviewer fallback and host-native skill invocation. Kept the scoped fix contract. |
| 31 | `poteto-help/SKILL.md` | Kept OMP installation and truthful capability limits. Updated source-guide links, setup offers, recipes, and explanations of configurable panels. |
| 34 | `poteto-mode/SKILL.md` | Imported current routing and prose guidance. Preserved the adapter boundary, canonical roles, root dispatch, full result reads, and explicit playbook paths. Added independent-review and stopped-writer gates. |
| 36 | `poteto-mode/playbooks/autonomous-run.md` | Preserved event watchers. Made timed continuation conditional on an exposed scheduler, with an exact manual checkpoint otherwise. |
| 37 | `poteto-mode/playbooks/autopilot-full.md` | Rebuilt from current upstream, including reduced repeat review, trunk collision handling, gate-loosening countersigns, and ketchup reporting. Kept root-owned merges, isolation, and host-neutral scheduling. |
| 38 | `poteto-mode/playbooks/autopilot-stack.md` | Rebuilt from current upstream's four steps. Preserved root-owned topology, dependency branches, and the freeze once landing begins. Owners never merge or spawn children. |
| 39 | `poteto-mode/playbooks/babysit.md` | Imported source changes while retaining the explicit merge-authorization boundary and root-controlled watcher lifecycle. |
| 40 | `poteto-mode/playbooks/bug-fix.md` | Preserved adapter delegation and root verification. Imported the current source workflow. |
| 41 | `poteto-mode/playbooks/eval.md` | Retained sanitized candidates, an independent blinded judge, and history restricted to the matching workspace. |
| 42 | `poteto-mode/playbooks/feature.md` | Kept bounded implementation, named data shapes, root-owned fan-out, and live adapter model routing. |
| 43 | `poteto-mode/playbooks/hillclimb.md` | Kept bounded isolated hypothesis workers and live adapter model routing. Imported source changes around the loop. |
| 45 | `poteto-mode/playbooks/multi-phase-plan.md` | Kept one shared plan reference. Rebuilt that reference from the current source skeleton and localized its model, driver, schedule, and merge instructions. |
| 46 | `poteto-mode/playbooks/opening-a-pr.md` | Imported current PR structure and forge behavior. Kept root-owned independent review and a bounded opener. Added confirmed writer shutdown before commit, merge, or deploy. |
| 47 | `poteto-mode/playbooks/orchestrate.md` | Adopted forge-based frontier discovery, matching the new `orch` implementation. Removed the obsolete Graphite requirement. Preserved root-started workers and isolated rebases. |
| 49 | `poteto-mode/playbooks/perf-issue.md` | Kept bounded implementation through the adapter and root verification of the real artifact. |
| 51 | `poteto-mode/playbooks/refactoring.md` | Kept bounded mechanical edits and root-owned equivalence verification. Imported the current source guidance. |
| 52 | `poteto-mode/playbooks/runtime-forensics.md` | Retained an isolated explorer for artifact reduction, without source-host task arguments. |
| 53 | `poteto-mode/playbooks/session-pickup.md` | Retained known-session history and durable handoff discovery. Never scan unrelated private transcripts. |
| 54 | `poteto-mode/playbooks/shipping.md` | Rebuilt from current upstream's six stages. Preserved exact-head independent verdicts, trunk-base checks, root-owned merging, guarded GitHub merges, and capability-based watching. |
| 55 | `poteto-mode/playbooks/trace-forensics.md` | Retained bounded explorer reduction. Imported the source's current paired-capture guidance. |
| 57 | `poteto-mode/playbooks/worktree-cleanup.md` | Adopted selectable PR base discovery. Kept active-session, lock, dirty, and unknown-state holds. Replaced both upstream force removal and the draft Trash bypass with plain removal and stop-on-refusal. |
| 79 | `poteto-mode/scripts/worktree-audit.sh` | Adopted default-branch and forge discovery. Retained lock and inspection holds, added explicit untracked-file enumeration and a scratch hold, and suppressed optional index writes. No global transcript scan. |
| 89 | `principle-guard-the-context-window/SKILL.md` | Kept bounded local processing when children are unavailable. Imported the source's reduced general guidance. |
| 104 | `recall/SKILL.md` | Kept cheap host-supported explorers and workspace-scoped history. Imported source changes without assuming a vendor model. |
| 105 | `reflect/SKILL.md` | Preserved the six-stage source workflow with portable reviewer roles and synthesis. Removed the assumed JSONL layout. Tracker writes require authorization. |
| 106 | `reflect/references/divergent-reviewer.md` | Imported reviewer guidance and retained host-neutral evidence of actual skill use. Removed the duplicated finding-shape introduction. |
| 107 | `reflect/references/judgment-reviewer.md` | Same portability treatment for the judgment lens, with one finding-shape introduction. |
| 109 | `reflect/references/tooling-reviewer.md` | Same portability treatment for the tooling lens, with one finding-shape introduction. |
| 115 | `setup-pstack/SKILL.md` | Added the source formal-verification offer and max-targeting unlimited budget. Kept project config, supported-effort validation, native OMP routing, and inactive-preference reporting. Panel examples now have two seats. |
| 117 | `show-me-your-work/SKILL.md` | Retained independent audit-trail review and verified model metadata. Missing independent review remains an explicit gap. |
| 120 | `swarm/SKILL.md` | Imported current reporting and aggregation. Kept total-worker versus concurrency separation and live host routing, without assumed cloud capacity. |
| 129 | `why/SKILL.md` | Imported the current investigative outline and companion-how distinction. Preserved tool discovery, no-write investigators, all seven evidence categories, citation checks, and confidence-separated synthesis. Removed duplicate roster prose. |

## OMP runtime correction

[OMP 18.12.5's discovery contract](https://github.com/can1357/oh-my-pi/blob/v18.12.5/docs/task-agent-discovery.md)
and the supplied failed-run evidence establish that a visible shared `model`
schema field does not authorize ordinary task model selection. The prior run at
`/tmp/pstack-omp-smoke-wQLZhY/workflow.json` reported
"`model` is only accepted for the `seance` agent."

The adapter, portable runtime reference, and setup skill now route ordinary
OMP workers through `task.agentModelOverrides`, agent frontmatter, or aliases
resolved by `modelRoles`. They omit the task item's `model` field. `seance`
requires `sourceSession` for historical consultation and is never a substitute
worker. Distinct simultaneous model choices need distinct discovered agents.
Other hosts and older OMP versions may use a per-agent model field only when
the selected ordinary agent actually supports it. Returned model metadata is
required before claiming a configured model or independent model family ran.

The parent reported five passing authenticated baseline scenarios after fixing
its smoke overlay. Those runs were not repeated by this delegate. This
delegate's installation suite did independently load the candidate in OMP
18.12.5, which verifies installation rather than authenticated worker routing.

## Selected safety adaptations and deferred host changes

The selected policies were inspected in `t3-pstack` at
`7a385649f1933be2b88ecabc5f5a7a407066d2e7`, particularly `tools/forks.json`
and `NOTICE.md`. Attribution and MIT notices were added to
`THIRD_PARTY_NOTICES.md`.

Included are GitHub's `--match-head-commit` guard, a closed gate when an
independent reviewer is unavailable, confirmed terminal status before replacing
overlapping writers, and plain `git worktree remove` with refusal as a stop.
The untracked-file audit cannot hide scratch through Git user configuration.

Deferred are T3's delegation APIs, model sheet and provider options, scheduler,
browser and device APIs, transcript resolver, and the entire watch-pr settle
overlay. Source Cursor model slugs, Task arguments, cloud requirements, UI
metadata, missing cursor-team-kit helpers, and Grok-specific webhook wording
were not imported as runtime requirements. Ketchup uses available plotting
tools rather than assuming `/visualize` exists.

The isolated content-refresh stage did not edit package manifests, plugin
manifests, CI workflows, the root updater, installation tests, or installation
documentation. The later integration deliberately changes those files for
Claude retirement, release metadata, and the CI repair.

## Verification

All commands ran in this isolated worktree. Detailed local output is in
`.audit/`. The local verification helper is `.audit/verify-refresh.py`.
The Prove It Works principle drove checking the actual package, test runners,
and final workflow text before reporting success.

| Command | Result |
| --- | --- |
| `node scripts/verify.mjs` | Passed. 61 skill directories and 128 Markdown files. |
| `node --test scripts/verify.test.mjs scripts/sync-upstream.test.mjs scripts/sync-proposal.test.mjs scripts/package.test.mjs scripts/omp-rpc.test.mjs` | Passed. 151 tests. |
| `bun install --frozen-lockfile --ignore-scripts` in `skills/poteto-mode/scripts` | Passed. Declared tools dependencies installed without changing manifests or locks. |
| `bun test skills/poteto-mode/scripts/orch skills/poteto-mode/scripts/watch-pr skills/poteto-mode/scripts/check-plan.test.ts` | Passed. 68 tests, including frontier discovery, review pagination, and fence cases. |
| `./node_modules/.bin/tsc --project watch-pr/tsconfig.json --noEmit --strict` in `skills/poteto-mode/scripts` | Passed. |
| `bash -n skills/poteto-mode/scripts/worktree-audit.sh` | Passed. |
| `python3 .audit/verify-refresh.py` | Passed. Checks workflow step order, duplicate headings, marker absence, all five new skills, OMP boundaries, safety policies, source pin, and changed-file scope. |
| `node scripts/sync-upstream.mjs --check --source /tmp/pstack-upstream-target-190d287` | Passed. Pin and recorded source version match `0.15.29`. |
| `git diff --check` | Passed. |
| `git apply --reverse --check .audit/refresh.patch` | Passed. The patch includes all five untracked skills, the fence test, and this report. Audit tooling and logs remain local. |
| `node --test scripts/*.test.mjs`, historical isolated-stage run | Failed only in the real-host installation suite's two OpenCode cases and their enclosing test. 156 passes, 3 failures. The installed OpenCode v2.1.2 rejects `opencode debug skill`. This run preceded Claude retirement. Its Claude installation case is removed in the integrated package. |

The first Bun run exposed two draft reconciliation defects. The fence-test
fixture omitted the retained checker's `previously unreported` marker. The
pagination test used the upstream field name. Both fixtures were corrected to
the local contracts without weakening the assertions. All tests were then
rerun as recorded above.

Independent release review remains the parent's responsibility. This handoff
does not claim merge-ready status. No commit, push, or PR was created.

## Integrated verification

After integration with Claude distribution removal and the CI repair, the fork
is `0.15.29-omp.1`. Package verification, 180 credential-free tests, 77 Bun
tests, TypeScript, and workflow structural checks pass. The live upstream check
confirms the recorded `0.15.29` source pin.

Isolated installation passes on OMP 18.12.5, Pi 1.3.0, Codex 0.163.0, and
Gemini CLI 0.65.0. OpenCode v2.1.2 still lacks the installation harness's old
`debug skill` command. That case is not reported as passing.

Authenticated smoke on OMP 18.12.5 with `openai-codex/gpt-6.1-sol:low` passes
help, setup, invalid-choice rejection, native child workflow, and asynchronous
lifecycle scenarios. It discovers 61 skills, consumes both full child reports,
and observes the expected numeric results. The fixture configures task and
scout models through native agent overrides. It does not prove simultaneous
dispatch across different model families.

Independent review found two defects in the imported frontier discovery.
Descendant queries now request open PRs directly with an explicit limit and
reject potentially truncated results. Branch lookup prefers a unique open PR
over closed history. Reused-branch regressions failed before the fix and pass
afterward for both supported forges. Query-limit cases fail instead of storing
an incomplete frontier.

Further review hardened the worktree audit and review-thread pagination. The
audit prefers live PRs over closed history, rejects malformed or potentially truncated PR
catalog, and labels only an ancestor of the selected base as safe. Squash-merged
or reused branches require manual review when ancestry does not prove the
current HEAD landed. Pagination rejects missing continuation cursors and cursor
cycles. Origin descendant queries include drafts through bounded all-state
results. Frontier discovery requires the remote default branch instead of
guessing `main`.

The final audit parser accepts exactly one JSON array and validates PR numbers,
non-empty branch names, and recognized states for both forges. Status casing is
normalized before classification. Both forge paths have malformed-document,
missing-branch, and uppercase-open regressions.
