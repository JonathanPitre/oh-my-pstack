# Reviewed upstream reconciliation

## Problem

Cursor pstack remains the content source. Pi and Oh My Pi need different model routing, tools, agent lifecycle, configuration, and transcript bindings. The update from `6ed0f7a9504f577d7529064103cecce9be7dfc5e` to `e43c7ee26e0038c6c1fa8380dd34ce86ff94cb2a` changes 46 mapped files and overlaps 24 local adaptations. Resolving those files in place under the old pin can conflict again. A reviewed result must enter the complete update plan directly.

## Usage (caller's view)

Routine updates keep the existing command and GitHub workflow.

```bash
npm run sync:apply
```

When overlaps stop the update, export the comparison outside the checkout.

```bash
node scripts/sync-upstream.mjs --export-review /tmp/pstack-review --source /tmp/upstream
```

Inspect the normalized baseline, actual local text, incoming text, and merge proposals. Each conflict needs an explicit write or deletion decision and a short reason. A missing decision remains unresolved, even when keeping the local text is correct. Review clean source changes for host assumptions too; the bundle is not a semantic verifier.

```bash
node scripts/sync-upstream.mjs --apply --review /tmp/pstack-review --dry-run --source /tmp/upstream
node scripts/sync-upstream.mjs --apply --review /tmp/pstack-review --source /tmp/upstream
npm run verify
npm run test:sync
```

Use the exact source revision recorded in the review. A newer source or changed managed input requires a fresh comparison. Keep the resulting skills and lock together in one validated PR. The daily workflow never loads old review decisions automatically.

## Shape

The existing updater owns inventory, normalization, ownership policy, three-way reconciliation, review validation, application, and pin advancement. There is one updater, not a second import pipeline. The runtime contract remains in `skills/pstack-pi`.

The conceptual types describe private data, not a new library interface.

```typescript
type FileState = null | { content: string; mode: number };
type Comparison = {
  path: string;
  baseline: FileState;
  local: FileState;
  incoming: FileState;
  outcome: { kind: "keep" | "write" | "delete" | "conflict"; reason?: string };
};
type ReviewDecision = null
  | { kind: "write"; reason: string }
  | { kind: "delete"; reason: string };
type UpdatePlan = {
  operations: readonly { path: string; content: string | null; sourceMode: string | null }[];
  conflicts: readonly { path: string; reason: string }[];
};
```

The review has a versioned manifest and private, numbered snapshot files. It binds the complete original lock, exact source revision, updater implementation, mapped path set, and local bytes, absence, and modes. Source states come from the actual Git revisions. Snapshot bindings are checked before decisions are consumed. Only recomputed conflicts may supply replacement content. Ordinary and clean adapted changes still come from the same planner. No arbitrary destination path can enter through a review.

Every conflict has an explicit decision. Writes consume exact UTF-8 resolved text. Deletion is a separate choice, not a missing file or an empty-file sentinel. Invalid UTF-8, NUL bytes, unresolved markers, unsafe paths, duplicate or omitted entries, and stale input fail before any destination write. Existing mode and source-type rules remain authoritative. Dry-run crosses the same checks without mutation.

The application loop installs every eligible operation and renames the lock last. Conflicts are no-write. Filesystem failure during application can leave partial destination writes, as today, but cannot advance the pin. Restore the original managed inputs in the isolated checkout before retrying. This is not a multi-file filesystem transaction.

Exact replay can succeed without writes only after validating the review and matching the complete reconstructed final managed state and new lock. Matching the pin alone is insufficient. After committing a completed update, ordinary `--apply` is the regular no-op path. Old decisions never carry forward to a different upstream revision.

The public interface adds two CLI options. It hides stale-input detection, complete conflict coverage, add/delete handling, and whole-plan integration. Maintainers edit outcomes; they do not coordinate destination writes or infer when repinning is safe.

## Synthesis decision

The bound review bundle is the base. Four independent architect candidates examined a bundle, an immutable Git resolution commit, native synthetic Git import history, and a separate source-plus-overlay renderer. An independent cross-judge preferred the bundle for its complete conflict-recovery usage and reuse of the current planner.

Retain ordinary Git commits and PRs as provenance, not a second review parser. Require path-specific approval even for unchanged local resolutions. Trim unrelated host-context and Git-HEAD bindings and mandatory approvals for already-clean operations. Root semantic review still covers all 46 source changes and records each of the 24 resolutions.

## Tradeoffs accepted

- We accept disposable review files in exchange for direct editor-based comparison and explicit per-file decisions.
- We accept stale-review rejection in exchange for an exact, comprehensible input contract.
- We accept human semantic review in exchange for retaining real upstream intent across prose translations.
- We retain the existing partial-write failure limitation instead of adding rollback journals or a filesystem transaction layer.

## Alternatives considered

- A Git resolution commit avoids a new artifact format but adds preparatory commits and cannot distinguish an omitted conflict from an intentional unchanged result without another per-path approval representation.
- Synthetic Git import history exposes temporary ancestry and merge recovery. Its proposed usage did not supply the reviewed result back to the updater, leaving the old-base remerge problem unsolved.
- A permanent overlay renderer adds authored source snapshots, transformations, generated outputs, and drift validation. Exact prose anchors still need human reconciliation; a second maintenance system does not remove the hard part.
- A manual whole-refresh PR can be correct, but makes each maintainer reconstruct the updater's clean operations, ownership, deletions, and mode rules.

## Open questions and risks

Can structural checks prove that the port retains upstream intent? No. Per-file comparison and runtime evidence are required. Can another process mutate the checkout during application? The updater is not a filesystem lock; use an exclusively owned integration checkout. Can an I/O failure roll back every file? No; the old pin remains and restoration must be scoped to the original managed inputs.

## Next implementation step

Extend the existing planner with bound review export and consumption, beginning with CLI behavior checks for complete reviewed application and stale-input no-write rejection.
