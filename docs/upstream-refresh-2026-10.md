# Upstream refresh after 6ed0f7a

This port updates the September 21 checkout from upstream pstack pin
`6ed0f7a9504f577d7529064103cecce9be7dfc5e` to
`e43c7ee26e0038c6c1fa8380dd34ce86ff94cb2a`. The portable package version stays
`0.15.2-pi.1`.

The comparison used that exact baseline. Of 132 mapped destinations, 46 files
changed upstream and 24 of those overlapped local adaptations. The remaining 22
clean changes, including three new skills, were imported by the planner.

## Bound review

Overlapping adapted files can no longer be resolved by editing destinations
under the old pin and rerunning `--apply`. That path rematches combined prose
against the old baseline and can conflict again.

The updater now exports a disposable review directory with
`--export-review DIR`, then applies `--apply --review DIR` only when every
recomputed conflict has an explicit write or delete. Ordinary clean files stay
planner-owned. The pin advances only with the complete validated tree. Exact
replay reconstructs the original baseline and incoming objects from the
lock-authorized source.

## Changes brought across

| Upstream change | Portable result |
| --- | --- |
| Architect/arena runner defaults and alias omit-model | Keep configured panels and live host rejection. Drop vendor slug tables. |
| How/why/interrogate/swarm/setup model blocks | Keep named config lines and seat counts. Root starts children. No silent substitution. |
| Fresh sessions, costly live-state exception, owner role outliving a session | Ported into poteto-mode and pstack-pi. |
| Autopilot hourly `/loop 1h`, code-ready rounds, change-only status | Ported. Root merges Autopilot-full. Owners do not spawn children. |
| Benchmark checklist, explain-the-number, correct | Imported as new skills and wired into poteto-mode, hillclimb, and perf-issue. |
| Feature mandatory arena | Kept. No skip-with-reason escape. |
| Plan checker ten live lanes | Require a selected host-supported role or model. Reject `host-configured role/model`. |
| Reflect list-each-learning and show-me-your-work append-only start rows | Ported. Transcript discovery stays project-scoped. |
| setup-pstack retired-role handling and capability split | Keep model vs delegation vs reasoning as separate live detections. |

## Portability decisions

`skills/pstack-pi` remains the runtime adapter. Canonical `planner`/`designer`
map to `designer` when that agent exists, otherwise a `task` brief. Canonical
`researcher` maps to `librarian` when that agent exists, otherwise an available
read-only research facility. Unavailable names are not invented.

The extracted `skills/poteto-mode/references/plan.md` is still the single plan
checklist authority. `multi-phase-plan.md` stays a pointer.

Do not merge until independent review of PR 4 lands.
