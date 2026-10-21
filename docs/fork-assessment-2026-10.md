# Fork assessment, October 2026

Keep this fork for Oh My Pi. Neither comparison project has demonstrated a replacement for its OMP task adapter. Refresh content from the original Cursor source, and borrow host-independent maintenance and safety improvements from the other ports.

This is a recommendation from source inspection and isolated installation probes on OMP 18.12.5. It is not a claim that every workflow in any project passed a model-backed run.

## Sources inspected

- [JonathanPitre/oh-my-pstack at 5aed139](https://github.com/JonathanPitre/oh-my-pstack/tree/5aed139738d235daeba9681e3ad86b5db1579ab4) was the comparison baseline. Its source pin was Cursor pstack `0.15.13` at `e5a8186d7b43be8d6ac4452440fbead5f1a51c70`.
- [chhoumann/t3-pstack at 7a38564](https://github.com/chhoumann/t3-pstack/tree/7a385649f1933be2b88ecabc5f5a7a407066d2e7) was release `2.0.0-rc.15`, with Cursor pstack `0.15.29` content.
- [lorenzk/oh-my-pstack at aeba9fa](https://github.com/lorenzk/oh-my-pstack/tree/aeba9fada3703b761218017eadc69df97e5e362e) was fork release `0.15.23-pi.1`.
- [edheltzel/PStack-for-OMP at a1efa98](https://github.com/edheltzel/PStack-for-OMP/tree/a1efa9866c6deadd8c16e2fc6b0a9de3cbffce43) was release `0.16.0`. This release number does not identify a Cursor source version.
- [Cursor pstack at 190d287](https://github.com/cursor/plugins/tree/190d28736eff128ec94f502a22c7fe0c4b56cd37/pstack) was the current content authority inspected, version `0.15.29`.

## T3 pstack is a maintenance reference

T3 pstack validates provider, model, and option selections against its live catalog. It derives most files with ordered substitutions and a denylist, and declares the files it deliberately forks. This makes unexpected upstream changes visible instead of allowing host bindings to drift silently.

Those ideas apply here. T3's `delegate_task`, model sheet, transcript tools, scheduler, and thread lifecycle do not implement OMP's task interface. Copying those calls would break this fork. Preserve native OMP dispatch, its supported model selectors, and full `agent://` result reads.

Useful follow-up work includes a smaller set of declared adaptation rules, broader checks for surviving host bindings, and explicit validation of requested versus observed model routing. A derivation rewrite needs its own migration and behavior checks. Removing protection from adapted files alone would allow upstream instructions to overwrite OMP behavior.

## Lorenzk is a stronger Pi-specific alternative

Lorenzk's README explicitly prioritizes Pi. Its extension adds deterministic `pstack_launch`, `pstack_panel`, `pstack_followup`, and `pstack_status` routing through `pi-subagents`, with a route ledger and diagnostic commands.

The package linked successfully on OMP 18.12.5. Skills resolved and diagnostic commands registered. This probe did not establish that its Pi-oriented launch tools work as OMP task delegation. Registration alone does not prove that boundary.

Borrow the requested-versus-observed routing evidence and diagnostic ideas. Do not introduce `pi-subagents` as an OMP dependency. For a user primarily running native Pi, Lorenzk merits a separate runtime evaluation.

## Edheltzel offers different OMP interaction

Edheltzel's native extension registers `/poteto-mode`, stores its enabled state in the conversation, and adds prompt context while enabled. It uses `ps-*` skill names. The local OMP probe found `/poteto-mode` and resolved its prefixed `ps-poteto-mode` skill, but the unprefixed `poteto-mode` skill did not resolve. Session resume behavior was inspected in code, not exercised.

This is useful interaction design, but it is not a compatible replacement for this fork's unprefixed skills, `pstack-pi`, and `orchestrate-omp`. Its inspected checkout also has no `LICENSE` or `NOTICE` file and records no exact Cursor content pin. Clarify source attribution before copying implementation. A sticky-mode feature can be designed independently if it becomes a requirement.

## CI failure and maintenance cost

The [reported scheduled run](https://github.com/JonathanPitre/oh-my-pstack/actions/runs/39545492122) exits with code 2 because upstream edits overlap local adaptations. This is a reconciliation rejection, not a Node or runner failure. The original job stops before preserving a review bundle, so the same unresolved update fails again every six hours.

The workflow repair exports the existing review format, uploads an `upstream-review` artifact, lists resolution commands, and skips the privileged proposal job. Unexpected errors still fail. A conflict does not advance the source pin or approve an update.

The inspected current-source plan had 41 conflicting files and 54 clean writes. That is evidence of maintenance cost, not evidence that either alternative already supports OMP better. Prefer fewer adaptation seams and executable drift checks over another broad handwritten port.

## Verification limits

The comparison baseline passed package verification, 151 credential-free tests, and isolated OMP installation. Both alternatives linked and exposed their expected skills on the same OMP binary. These probes did not exercise alternative child model routing, full engineering playbooks, or sticky session restoration. Keep those gaps explicit when deciding whether to switch.

Claude Code distribution is retired from this fork. OMP users may still select Claude or Grok models through supported native capabilities. Cursor, Claude, and Grok workflows outside this OMP integration should use the original pstack plugin.
