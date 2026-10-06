# Oh My Pi fork hardening

Date: 2026-10-06

## Agreed intent

Make JonathanPitre/oh-my-pstack a reliable Oh My Pi-first pstack distribution while avoiding unnecessary maintenance ownership. Preserve Cursor pstack workflow intent, track a documented upstream revision, and advance it after compatibility review; upstream lag is acceptable. Improve this fork now without requiring migration to another port.

The user approved independent fork releases and the architecture, verification, and documentation sections presented in chat. This specification still requires written-spec review before implementation planning, followed by plan review and execution-method selection before product changes.

Success means demonstrated OMP behavior, safe reviewed synchronization, independently releasable fork fixes, and clear onboarding. Installation success or a green unit suite alone is not proof that workflow behavior works.

## Baseline and evidence

- Local package and installed pstack-pi version: 0.15.13.
- Cursor source: `cursor/plugins`, path `pstack`, commit `77526ffa67f8dafc698d14b5356e6d4fc78c3127`, plugin version 0.15.13.
- Observed local OMP: 18.6.1; Node: 26.8.1; Bun: 1.4.2.
- Executed `npm run verify`: 56 skill directories and 117 Markdown files verified.
- Executed `node --test scripts/verify.test.mjs scripts/sync-upstream.test.mjs`: 77 passed, zero failed or skipped.
- Executed `bun test orch watch-pr` from `skills/poteto-mode/scripts`: 52 passed, zero failed.
- Executed nested `bun run typecheck`: strict TypeScript check succeeded.
- Executed `npm run test:install`: seven isolated installation paths passed (OMP, Pi, OpenCode global/project, Claude Code, Codex, Gemini); eight tests including the parent, zero failed or skipped. Listed live configuration files were unchanged.
- Executed native OMP plugin listing and setup-skill resource loading. These establish registration/loading, not model-backed setup or workflow compatibility.

Baseline source review identified:

1. The sync workflow executes incoming candidate tests with repository write permissions and persisted checkout credentials, then automatically merges updates.
2. Review export accepts an existing directory and writes snapshots/manifest using ordinary writes without protecting existing output symlinks or canonical ancestor boundaries.
3. Reconciliation suppresses operations on byte equality even when an upstream executable mode changed.
4. `poteto-help` still presents Cursor installation, Custom Modes, and delegation assumptions as applicable to this port.
5. OMP installation checks load two entry skills but do not prove complete packaged inventory or live workflow behavior.

Items 2 and 3 are source-review findings requiring failing-before/passing-after reproductions. Workflow privilege exposure is directly visible in the source; no malicious payload, remote workflow run, or credential access was performed. Existing Pi-only setup writes are conditional: there is no demonstrated unconditional write to Pi settings under OMP.

Existing edits to README.md and package.json and an untracked publish-npm workflow belong to the user. Implementation must preserve their intent; the specification commit includes none of them.

## Selected approach

Harden the existing adapter and scripts. Keep `poteto-mode` as workflow router, `pstack-pi` as host binding, and the existing updater, verifier, and installation harness as maintenance boundaries.

Alternatives rejected for this task:

- Rebase onto pstack-claude: turns hardening into a migration and brings additional runtime/policy decisions.
- Add a dedicated OMP extension: duplicates facilities already supplied by OMP and adds an unnecessary maintenance surface.
- Import an external verifier or sync framework wholesale: duplicates existing local tools and introduces host-specific assumptions.

## 1. OMP runtime and onboarding

### Ownership and flow

The shared skills retain workflow semantics. The runtime adapter translates canonical roles and lifecycle operations using the host's current schema and inventory. Setup records only choices that can actually be applied. Help explains the installed fork rather than claiming the Cursor UI is available.

Use one canonical adapter contract; fix inconsistent callers instead of copying adapter rules into every skill.

### Required behavior

- OMP setup explicitly distinguishes OMP from native Pi and OpenCode. OMP uses supported task/model facilities and portable project configuration, not Pi extension installation or Pi settings.
- Preserve existing valid configuration and unrelated keys. Apply changes only to the intended disposable/project settings or explicit `$PSTACK_CONFIG` target.
- Map canonical roles to available agents. Omit the default agent field when required by the live tool schema. Never dispatch a nonexistent named agent.
- Accept only verified model selectors. Unavailable requested models are reported, never silently replaced.
- Unsupported reasoning controls are not written or described as applied. Existing unsupported entries must be reported rather than silently misrepresented.
- Preserve supported panel size/order. Invalid panel/model/effort combinations are reported before dispatch.
- Consume delivered asynchronous results and read full resources when necessary. Wait only when blocked on owned running work; do not introduce polling where native delivery suffices.
- Use live-supported history/process resources. Do not promise that saved agent identifiers revive sessions after restart.
- Do not promise scheduled audits unless a scheduler is actually available. Otherwise describe an explicit checkpoint and resumption procedure.
- Distinguish user invocation (`/skill:<name>` on OMP) from resource reads (`skill://<name>`) and skill-relative bundled references.
- Replace stale help instructions and false other-host limitations; label upstream Cursor documentation as conceptual reference, not OMP command documentation.

Preserve existing native Pi, OpenCode, Claude Code, Codex, and Gemini support. OMP-first changes do not silently remove other hosts or import a Pi-specific extension into OMP.

## 2. Reviewed upstream synchronization

### Updater correctness

Extend the current reconciliation planner, not a second importer.

- Compare applicable content and executable mode when deciding whether an operation is required.
- Handle upstream-owned mode-only changes in both directions and same-pin mode drift. Preserve deliberate local modes for adapted files according to existing ownership rules.
- Keep explicit conflict decisions, stale-review rejection, deterministic three-way reconciliation, local-only preservation, and pin-last application.
- Review exports require a fresh, exclusively created review directory. Refuse reuse rather than support arbitrary populated output trees.
- Resolve canonical parent/destination boundaries before export. Reject paths that enter the managed destination through symlinks.
- Create generated review outputs exclusively in the owned directory; existing symlinks/files must not be followed or overwritten.
- Safety rejection leaves managed files, metadata, and unrelated sentinel files unchanged.
- Retain the documented partial-write-on-I/O-failure limitation: a failed application must not advance the pin. Do not add transaction journals or pretend rollback is guaranteed.

### Automation and review

The scheduled workflow proposes updates; it does not merge them automatically.

Separate credential-free/read-only candidate preparation and validation from a write-capable proposal job. Candidate tests and dependency lifecycle scripts never execute in the job with repository write permissions. Disable persisted checkout credentials in candidate execution. The proposal job consumes a bounded, validated candidate artifact from the same workflow run, preserves source/base identity, and never executes code from that artifact.

Use trusted proposal logic and explicit allowed paths; reject artifact path/type violations. Keep useful exact-head/tree/base checks where applicable, but remove merge-only machinery made obsolete by proposal-only behavior.

A reviewer promotes the exact proposed revision after examining semantic changes and OMP evidence. A clean textual merge or automated test result is not semantic approval. Retain scheduled discovery; correct documentation to reflect the actual configured schedule rather than promise daily behavior irrespective of configuration.

## 3. Independent releases and provenance

Keep the package identity `pstack-pi`.

- Fork version is controlled locally and must agree across the existing package/plugin version surfaces.
- Add `version` to the authoritative upstream lock alongside its `commit`; it records the Cursor plugin version read from that exact revision.
- Upstream sync updates source version/commit together but does not overwrite the fork's version or other fork manifest fields.
- Validate supported SemVer values before destination writes. The initial source version is 0.15.13, independently confirmed from the pinned Cursor manifest.
- Bump the fork from 0.15.13 to 0.16.0 for this behavior-changing cutover; subsequent versions follow the fork's own release history.
- Update tests and documentation that currently require equality between fork and upstream versions. Keep agreement among fork manifests.
- Validate release-tag/package-version agreement and packaged content before publishing. No publication, tagging, PR submission, or change to live installed packages is part of this task.

The existing explicit local `--source` mechanism remains a trusted development/fixture override; do not turn this task into a new signature, ancestry, or multi-upstream framework.

## 4. Layered verification

### Deterministic checks

Extend existing Node and Bun checks. Add regressions for plausible consumer-visible failures, not wording, source substrings, copied defaults, or mock forwarding.

Required regression coverage includes:

- Mode-only upstream updates and same-pin repair, with applicable local mode protection.
- Unsafe/reused review output directories, canonical containment, pre-existing output links, and no unintended file mutation on rejection.
- Independent fork version preservation and exact source version/commit recording.
- Existing stale-review, conflict, deletion, invalid-input, and pin-last behavior remains covered.
- Distributable-reference containment and existence, including symlink escapes and references to unshipped files in the supported install mode.

Credential-free PR CI runs structural verification, updater/verifier regressions, bundled tools tests, strict TypeScript checking, and packed-artifact checks with read-only permissions. Keep lockfile-based dependencies; do not add a generic test framework.

### Packed and installed artifact

Use npm's real package output in a disposable directory with lifecycle scripts disabled. Extract and verify the package, check runtime manifests/references, and demonstrate that required skills, agents, resources, notices, and documentation are shipped. Do not treat a source checkout or dry-run file list alone as release-artifact proof.

Extend the existing OMP installation seam to validate the complete candidate skill inventory, including the adapter/help resources, and installed-source identity. Reuse isolated HOME/XDG/project roots and configuration snapshots. Do not infer OMP compatibility from a Pi or Claude test.

Provide an OMP-only installation selection without requiring all other host binaries, while preserving the current full-matrix default. A narrow `PSTACK_INSTALL_HOSTS` selection names supported host keys; unknown names fail explicitly. OpenCode selection retains both global and project cases. Keep the broader installation matrix as a separate pre-release/periodic check.

### Authenticated OMP scenarios

Add a small separately invoked OMP-native behavioral smoke path. Model-backed checks are explicit, bounded, and never required in ordinary credential-free CI. Use a discovered/explicitly selected model, not guessed provider aliases or silent fallbacks.

Run in disposable projects/state. Obtain only the required authentication through the host's supported mechanism; never print credentials or mutate real account/plugin configuration. Record runtime/model/source identity and inspect machine-readable tool traces and resulting state.

Required scenarios:

1. Help plus skill/resource loading presents commands valid for OMP and loads bundled sibling resources.
2. Setup persists only supported model choices, preserves unrelated existing configuration, and does not create Pi settings under OMP.
3. Unavailable model choices and unsupported reasoning preferences are reported before any invalid dispatch; valid choices remain usable.
4. A small workflow performs real native delegation, handles an unavailable canonical role through supported mapping, and consumes the full asynchronous child result.
5. A finite task demonstrates lifecycle handling without claiming an unsupported scheduler, resumed agent, or background loop.

Assertions target observed configuration, files, tool calls, and completion state, not exact model phrasing. A returned model claim is insufficient. Report unexercised capabilities explicitly. Keep only useful bounded evidence; remove throwaway fixtures after execution. Do not build a recipe DSL, all-skill model sweep, cross-provider runner, or hosted evidence service.

## 5. Documentation

### README

Keep the main path OMP-first:

1. Purpose and unofficial lineage.
2. Verified installation and discovery.
3. `/skill:setup-pstack` and one `/skill:poteto-mode` example.
4. What setup/delegation provides, model-use costs, and honest limitations.
5. Fork version versus tracked Cursor version/revision.
6. Links to detailed installation, maintenance, verification, and attribution.

Move other-host installation details into `docs/installation.md` and contributor/release/sync procedures into `docs/maintenance.md`. Preserve useful existing instructions instead of deleting support. Keep these linked consumer/maintainer documents in the package where installed README references require them. Avoid publishing the design/plan history unnecessarily.

Update poteto-help and runtime/setup documentation together so the help path and README agree. Retain existing upstream architecture documentation as a technical reference rather than duplicate it.

Record this cutover and intentional local adaptations in a concise root change record. Keep attribution in THIRD_PARTY_NOTICES.md for any substantial copied/adapted source or prose.

## Comparator mechanisms and attribution

Reviewed sources:

- pstack-claude at `faa451c0c3d09e056bf8d82e476deee5ea51a42a`: [live Pi tests](https://github.com/michael-denyer/pstack-claude/blob/faa451c0c3d09e056bf8d82e476deee5ea51a42a/tests/pi/live.test.mjs), [skill validation](https://github.com/michael-denyer/pstack-claude/blob/faa451c0c3d09e056bf8d82e476deee5ea51a42a/tools/validate-skills.mjs), and [contributing/sync ownership](https://github.com/michael-denyer/pstack-claude/blob/faa451c0c3d09e056bf8d82e476deee5ea51a42a/CONTRIBUTING.md).
- open-pstack at observed head `1b03678171f6f400ae2cc9dc4e7a4a6a13e4bb43`: [behavior recipes](https://github.com/ericlitman/open-pstack/blob/1b03678171f6f400ae2cc9dc4e7a4a6a13e4bb43/.claude/skills/verify-open-pstack/features/recipes.ts), [installed harness](https://github.com/ericlitman/open-pstack/blob/1b03678171f6f400ae2cc9dc4e7a4a6a13e4bb43/.claude/skills/verify-open-pstack/scripts/harness.ts), and [upstream discipline](https://github.com/ericlitman/open-pstack/blob/1b03678171f6f400ae2cc9dc4e7a4a6a13e4bb43/UPSTREAM.md). Discovery fetched these files through moving main links; re-read pinned source before any material reuse.

Adapt behavioral testing, package/reference validation, installed-source evidence, and explicit local ownership. Do not import their Pi extension, provider-model defaults, Claude/Codex runners, Mac-only verifier, policy fork catalog, or GitHub evidence-publishing framework.

Both comparator ports use MIT licensing. Preserve applicable notices and record exact source/path/revision when reusing substantial material; a mechanism review is not proof that their code works on OMP.

## Acceptance and non-goals

Implementation is complete only when:

- Confirmed source findings have safe failing-before/passing-after reproductions and permanent targeted regressions.
- Upstream automation proposes updates without automatic merging or write-capable candidate execution.
- Independent fork/source version behavior is verified and all affected metadata/callers/tests agree.
- Packed artifact, full existing deterministic checks, and isolated OMP install checks pass.
- The existing broader host matrix is exercised and regressions are fixed or a genuine unavailable prerequisite is stated.
- Authenticated OMP scenarios run and produce inspectable evidence; no untested capability is represented as verified.
- README, help/setup/runtime guidance, detailed documents, change record, and applicable attribution agree.
- User work is preserved and temporary test scaffolding is removed.

Non-goals: migration to another port, external maintainer outreach, PR submission, publishing, package renaming, a new runtime extension, wholesale policy changes, exhaustive model-backed testing of every skill, rollback journals, retries/telemetry frameworks, or deleting other-host support.
