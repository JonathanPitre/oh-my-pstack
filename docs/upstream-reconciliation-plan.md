# Upstream compatibility implementation plan

> Execute through architect's independent implementation slices. The root owns integration, per-file acceptance, runtime checks, and publication. Workers do not start children or run builds, tests, lint, or formatters mid-flight.

**Goal:** Import the complete frozen upstream revision while preserving Oh My Pi and Pi behavior, and provide a safe recurring conflict-resolution command.

**Architecture:** [Reviewed upstream reconciliation](upstream-compatibility-design.md). The existing updater accepts a bound disposable review; the existing runtime adapter owns host translation.

**Tech stack:** Existing Node ESM, Git, Bun scripts, Markdown Agent Skills. No new dependency or generated source tree.

## Global constraints

- Source baseline is `6ed0f7a9504f577d7529064103cecce9be7dfc5e`; incoming is `e43c7ee26e0038c6c1fa8380dd34ce86ff94cb2a`.
- Keep all clean upstream additions, modifications, deletions, and modes. Preserve local-only adapters.
- Every conflict requires an individual upstream-intent/local-binding decision. No global side preference.
- An unresolved or stale review writes no managed destination and does not advance the pin.
- Keep daily automation, validation, and exact head/tree/base merge guards. PR #3 runtime modernization is independent.
- Live host capabilities override stale adapter examples. OMP supports per-item task model selection here; unavailable agent names cannot be dispatched.
- Root verifies all changed paths and exercises actual CLI paths before publication.

## Review focus

- An omitted unchanged-local conflict must remain unresolved, not become accidental approval.
- Empty text and deliberate deletion must remain different states.
- Source revision, local bytes/modes, mappings, and updater changes must invalidate old reviews before writes.
- A successful repeated apply must verify the complete resulting state, not only the pin.
- Textually clean imports can still introduce unsupported host behavior; review all 46 upstream-changed paths.

## Task 1. Add reviewed application to the updater

**Files:** `scripts/sync-upstream.mjs`, `scripts/sync-upstream.test.mjs`.

**Interface:** Add `--export-review DIR` and `--apply --review DIR` to the existing CLI. Keep existing check/apply/source/dry-run behavior and exports.

- [ ] Add behavior regressions through real Git fixtures for export no-write, explicit text and deletion decisions, complete mixed update, stale/missing/unsafe input rejection, dry-run, replay, and future overlaps.
- [ ] Root observes failing-before behavior before implementation.
- [ ] Extend the existing planner and application path; keep manifest parsing private and ownership logic in one place.
- [ ] Root runs updater tests and actual export/resolve/apply commands after all edits settle.

## Task 2. Reconcile core skill conflicts

**Files:** `architect`, `arena`, `figure-it-out`, `how`, `interrogate`, `reflect`, `setup-pstack`, `show-me-your-work`, `swarm`, and `why` `SKILL.md` files.

**Interface:** Write final content outside managed destinations. Root supplies it as explicit review decisions only where the recomputed planner reports conflicts.

- [ ] Compare baseline, incoming, and local text for each file separately.
- [ ] Preserve upstream requirements and translate only host mechanics through `pstack-pi`.
- [ ] Record each file's upstream intent, retained adaptation, and final decision.
- [ ] Root accepts each named conflict individually and verifies cross-skill consistency.

## Task 3. Reconcile playbook conflicts

**Files:** `autopilot-full`, `autopilot-stack`, `bug-fix`, `feature`, `hillclimb`, `multi-phase-plan`, `opening-a-pr`, `pause-safely`, `perf-issue`, `refactoring`, and `shipping` playbooks; the local extracted `references/plan.md` where its source behavior moved.

- [ ] Compare all three inputs per playbook and retain fresh-owner, verification-round, hourly-audit, change-only status, and benchmark requirements.
- [ ] Keep root-controlled agent starts, portable control surfaces, GitHub-default forge resolution, operator gates, and the existing single extracted plan source.
- [ ] Record every conflict decision separately; root accepts each file before integration.

## Task 4. Integrate router, runtime, and complete update

**Files:** `poteto-mode/SKILL.md`, `principle-guard-the-context-window/SKILL.md`, `poteto-mode/scripts/check-plan.mjs`, `pstack-pi` adapter/runtime contract, lock, README, and refresh decision record.

- [ ] Root captures failing-before hourly-plan CLI output, then reconciles the checker and plan contract without weakening required evidence/lane coverage.
- [ ] Preserve new principle and benchmark triggers and the fresh-session exception for costly live state.
- [ ] Replace unsupported OMP schema/roster assumptions with live-capability routing. Remove duplicate runtime guidance where touched.
- [ ] Review all 22 non-conflicting changed paths, including the three new skills, then apply the full update through the reviewed CLI.
- [ ] Run structural verification, updater tests, frozen Bun install, Bun suites, strict typecheck, package inventory, decision-log and plan-checker smoke.
- [ ] Prove exact reviewed replay, ordinary no-op, a later independent update, and a later overlap rejecting without writes.
- [ ] Obtain independent code/security and semantic reviews. Publish one ready PR without merging or deploying it.
