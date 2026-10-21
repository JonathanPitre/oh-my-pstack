---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Follow the [portable runtime contract](../pstack-pi/references/runtime.md) for child briefs, parallel execution, panels, models, and fallbacks.

Fan out N parallel attempts at the same task. Read every candidate end to end. Pick the strongest as the base. Graft the best ideas from the others into it. Verify the synthesized result.

## Start

Track one checklist entry per phase before launching anything. Use the host's planning facility when available; otherwise keep a compact checklist in the conversation or project-local decision trail.

1. Frame
2. Fan out
3. Cross-judge
4. Pick
5. Graft
6. Verify

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric. State what success looks like for *this* task, then turn it into 3-6 concrete gradeable criteria. The rubric is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners. Use the `arena runners` panel from `$PSTACK_CONFIG` when that variable is set, otherwise `.pstack/config.md`. One child runs per entry, so list length is N. `auto` or `inherit-parent` means omit an explicit model when the host can pass the parent model to a child. If the line is missing, select a diverse panel from the live host's child facility and route each choice through the portable runtime contract. Role names are not proof of distinct models. If the host rejects a configured seat, honor its documented rejection and fallback policy and report the unfilled seat; do not guess a vendor family or substitute a default slug. Spawn more when the arena covers multiple design directions. Repeating one live-host choice N times is valid when the work is generation-bound rather than judgment-sensitive. A missing child facility is a capability gap, not a completed arena.
4. Assign output paths. Each candidate writes to its own location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill.

## Phase B: Fan out

Launch all N children concurrently through the host's task facility. Give each a standalone brief with the task, the path to the shared grounding, its own output path, acceptance criteria, verification, forbidden scope, and instructions to produce both the artifact and a short rationale.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, choose one entry from the `arena cross-judge pool` in `$PSTACK_CONFIG` when that variable is set, otherwise `.pstack/config.md`. If that line is missing, choose an independent live-host reviewer or synthesizer that is not one of the candidate runners. Prefer a different model family from the parent's when returned resolved-model metadata demonstrates it. `auto` or `inherit-parent` omits an explicit model when the host supports inheritance. Launch one read-only judge child on that choice with a standalone brief. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with the parent's reading in Phase D, not with the candidates themselves. Don't spawn the judge while candidates are still writing. If the host rejects the chosen judge, honor its documented rejection and fallback policy and report the gap; do not guess a vendor family default. A missing child facility is a capability gap, not an independent cross-judge.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
