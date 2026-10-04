---
name: how
description: "Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture, runtime flow, onboarding mental models. Use why for motivation."
disable-model-invocation: true
---

# How

Follow the [portable runtime contract](../pstack-pi/references/runtime.md) for explorer and synthesizer roles, model choices, and host fallbacks.

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

Use the `how explorer` and `how explainer` lines from `$PSTACK_CONFIG` when that variable is set, otherwise `.pstack/config.md`. Pass a per-item `model` only when the live task schema exposes that field and the value is in the live inventory. Leave the model unset for `auto` or `inherit-parent` when the host can pass the parent model to a child. If the host rejects a configured choice, honor its documented rejection and fallback policy and report the gap; do not guess a vendor family or substitute a default slug. A missing child facility is a capability gap: the root may explore on the active model, but it must not claim independent explorer or explainer children ran.

## Step 1. Assess Complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorers. One explainer explores and explains in a single pass. Go to Step 2b.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): spawn parallel explorers first, then hand off to the explainer. Go to Step 2a.

When in doubt, take the simple path.

## Step 2a. Explore (complex questions only)

Decompose the question into 2 to 4 exploration angles, each a distinct slice of the subsystem. The root launches all explorers concurrently through the host's task facility. Use the configured `how explorer` choice when present; otherwise map the canonical `explorer` role through the live host inventory. Every explorer is read-only and receives a standalone brief.

Each explorer gets the prompt in `references/explorer-prompt.md` with its angle filled in. Then go to Step 3.

## Step 2b. Direct Explain (simple questions)

The root launches one read-only child that explores and explains in one pass. Use the configured `how explainer` choice when present; otherwise map the canonical `synthesizer` role through the live host inventory.

Build its prompt from `references/explainer-prompt.md` without the explorer-findings section. Go to Step 4.

## Step 3. Synthesize (complex questions only)

Once all explorers return, the root launches one read-only child to synthesize their findings into a coherent explanation. Use the configured `how explainer` choice when present; otherwise map the canonical `synthesizer` role through the live host inventory.

Build its prompt from `references/explainer-prompt.md` with every explorer's findings filled in.

## Step 4. Present

Present the explainer's output to the user. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

## Output Format

The explanation uses the sections defined in `references/explainer-prompt.md`, dropping any that do not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.
