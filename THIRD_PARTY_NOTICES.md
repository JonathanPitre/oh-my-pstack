# Third-party notices

## pstack

The workflow skills, principle skills, references, playbooks, and scripts under
`skills/` contain material adapted from
[`cursor/plugins`](https://github.com/cursor/plugins/tree/main/pstack).

```text
MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Portable safety policies

The independent-review gate and abandoned-writer stop rules in
`skills/poteto-mode/SKILL.md`, the writer-stop rule in
`skills/poteto-mode/playbooks/opening-a-pr.md`, and the GitHub
`--match-head-commit` guard in `skills/poteto-mode/playbooks/shipping.md` and
`autopilot-full.md` are adapted from Michael Denyer's
[`pstack-claude`](https://github.com/michael-denyer/pstack-claude), through
Christian Bager Bach Houmann's
[`t3-pstack`](https://github.com/chhoumann/t3-pstack).

The plain `git worktree remove` rule, including stopping on refusal, in
`skills/poteto-mode/playbooks/worktree-cleanup.md` is adapted through
`t3-pstack` from Sergey Chilingaryan's
[`jutsu` at da9442422c72cc99442c1ce3500d2f2485234a31](https://github.com/sergchil/jutsu/commit/da9442422c72cc99442c1ce3500d2f2485234a31).
The explicit untracked-file audit and suppression of optional Git index writes
in `skills/poteto-mode/scripts/worktree-audit.sh` also follow the corresponding
`t3-pstack` safety policies.

These are selected host-neutral policy adaptations. The T3 orchestration APIs,
model sheet, scheduler, transcript resolver, and watch-pr settle overlay are not
included. The source inventory is `tools/forks.json` and `NOTICE.md` in
`t3-pstack`.

```text
MIT License

Copyright (c) 2026 Michael Denyer
Copyright (c) 2026 Christian Bager Bach Houmann
Copyright (c) 2026 Sergey Chilingaryan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## orchestrate

`orchestrate-omp` contains material adapted from [`provencher/codex-skills`](https://github.com/provencher/codex-skills/tree/main/orchestrate).

```text
MIT License

Copyright (c) 2026 Eric Provencher

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
