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

The N candidates will receive the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric. State what success looks like for *this* task, then turn it into 3-6 concrete gradeable criteria. The rubric is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners. Use the `arena runners` panel from `$PSTACK_CONFIG` when that variable is set, otherwise `.pstack/config.md`. One child runs per entry, so list length is N. `auto` or `inherit-parent` means omit an explicit model when the host can pass the parent model to a child. If the line is missing, select a diverse panel from the live host's child facility and pass a per-item `model` only when the live task schema exposes that field and the value is in the live inventory. Role names are not proof of distinct models. If the host rejects a configured seat, honor its documented rejection and fallback policy and report the unfilled seat; do not guess a vendor family or substitute a default slug. Spawn more when the arena covers multiple design directions. Repeating one live-host choice N times is valid when the work is generation-bound rather than judgment-sensitive. A missing child facility is a capability gap, not a completed arena.
4. Assign output paths. Each candidate writes to its own location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill.

## Phase B: Fan out

Launch all N children concurrently through the host's task facility. Give each a standalone brief with the task, the path to the shared grounding, its own output path, acceptance criteria, verification, forbidden scope, and instructions to produce both the artifact and a short rationale.

Each rationale names the alternatives the candidate considered and what it rejected.

If a candidate fails to produce output, proceed with N-1 and note the dropout in the synthesis record.

## Phase C: Cross-judge

After all Phase B candidates complete, choose one entry from the `arena cross-judge pool` in `$PSTACK_CONFIG` when that variable is set, otherwise `.pstack/config.md`. If that line is missing, choose an independent live-host reviewer or synthesizer that is not one of the candidate runners. Prefer a different model family from the parent's when returned resolved-model metadata demonstrates it. `auto` or `inherit-parent` omits an explicit model when the host supports inheritance. Launch one read-only judge child on that choice with a standalone brief. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with the parent's reading in Phase D, not with the candidates themselves. Don't spawn the judge while candidates are still writing. If the host rejects the chosen judge, honor its documented rejection and fallback policy and report the gap; do not guess a vendor family default. A missing child facility is a capability gap, not an independent cross-judge.

## Phase D: Pick a base

Read every candidate end to end before picking.

Score each candidate against the rubric criterion by criterion, not on holistic feel. Compare against the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base on which candidate a future maintainer can extend most easily without breaking invariants. Prefer the cleaner boundary or smaller API when two feel tied, per the Laziness Protocol.

Record the pick and the reason in a short synthesis note alongside the base artifact, including the cross-judge's verdict.

## Phase E: Graft

Walk each losing candidate once more and identify what is worth porting into the base. The signal is usually one or two things per candidate, not most of it.

Fold each graft in by hand, per the **redesign-from-first-principles** principle skill. Don't paste mechanically. The result has to remain coherent under one mental model.

Record what was grafted, from which candidate, and what was rejected and why.

When N candidates converge on the same shape, that is a strong agreement signal. Note the convergence in the record and ship the consensus shape. No graft is needed. When N candidates wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

The synthesized artifact has to hold up under the same scrutiny as any other output, per the **prove-it-works** principle skill.

If verification surfaces a problem the arena did not catch, either Phase A was wrong (re-frame and re-run) or one candidate caught it and you missed the graft (go back to Phase E). Don't paper over.

## Outputs

One synthesized artifact. One short synthesis note alongside, naming the base, the grafts (with source candidate), the rejections, the dropouts if any, and the verification result.
