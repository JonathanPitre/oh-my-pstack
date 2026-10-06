# Maintenance

This document is for people who update, verify, or release the fork. Consumer install steps live in [installation.md](installation.md).

## Versions

`package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` must agree on the fork version. The current release is `0.15.13-omp.1`.

`upstream.lock.json` records the Cursor source separately: version `0.15.13` at commit `77526ffa67f8dafc698d14b5356e6d4fc78c3127`. Sync updates that pin. It does not rewrite fork manifests.

SemVer treats the `omp` suffix as a prerelease. After publication, npm examples should use `pstack-pi@omp`, not an implied stable `latest` release. Git installation remains the primary path until a version is actually on the registry.

When preparing a release after a reviewed source advance, choose a corresponding fork version explicitly. Independent fork fixes on the same baseline increment the omp revision, for example `0.15.13-omp.2`.

## Deterministic checks

From the repository root:

```bash
npm run verify
node --test scripts/verify.test.mjs scripts/sync-upstream.test.mjs scripts/sync-proposal.test.mjs scripts/omp-rpc.test.mjs scripts/package.test.mjs
bun --cwd skills/poteto-mode/scripts test orch watch-pr
bun --cwd skills/poteto-mode/scripts run typecheck
```

`npm run verify` checks skill inventory, frontmatter, local references, `skill://` targets, manifests, the upstream lock, and forbidden vendor-specific runtime bindings. Skill resource targets must resolve to files within their named skill.

`npm run test:package` packs with npm, extracts the tarball, and runs the verifier on that tree. A missing installed skill resource must fail.

## Isolated installation

The installation gate requires OMP, Pi, OpenCode, Claude Code, Codex, Gemini CLI, Git, and outbound package/GitHub access:

```bash
npm run test:install
PSTACK_INSTALL_HOSTS=omp npm run test:install
PSTACK_INSTALL_SOURCE=https://github.com/JonathanPitre/oh-my-pstack npm run test:install
```

The default run installs an isolated copy of this checkout. `PSTACK_INSTALL_HOSTS` selects named hosts; unknown names fail. A local directory can also be supplied as `PSTACK_INSTALL_SOURCE`. Each host receives a disposable HOME/project and temporary XDG roots. Missing hosts and discovery failures fail rather than skip.

Use `PSTACK_OMP_BIN`, `PSTACK_PI_BIN`, `PSTACK_OPENCODE_BIN`, `PSTACK_CLAUDE_BIN`, `PSTACK_CODEX_BIN`, and `PSTACK_GEMINI_BIN` to select direct installed executables. Avoid tool-manager wrappers that change global configuration.

## Authenticated OMP smoke

Model-backed smoke is separate from credential-free CI:

```bash
PSTACK_OMP_MODEL=openai-codex/gpt-6.1-sol npm run smoke:omp
```

Set `PSTACK_OMP_MODEL` to an exact available `provider/model` selector. A documented thinking suffix is kept only when that model supports it. Do not substitute another model. The script uses disposable HOME state and does not print credentials.

## Reviewed upstream synchronization

`.github/workflows/upstream-sync.yml` checks the original pstack `main` branch every six hours at minute 17 and can also be started manually. The candidate job has read-only permissions and disabled checkout credentials. If owned `skills/` or `upstream.lock.json` files change, it verifies the tree and uploads only `proposal.patch` and `metadata.json`. A second job applies that artifact with `scripts/sync-proposal.mjs` in a trusted checkout and opens an inspectable pull request. It does not merge automatically.

A failed application must not advance the pin. There is no rollback journal; recover by discarding the dirty tree and keeping the last successful lock.

`--source` is a trusted local development override. It is not a signature, ancestry, or multi-upstream framework.

### Local review export

The parent directory must already exist. The review leaf must not. Use a fresh name for another export.

```bash
npm run sync:check
npm run sync:apply -- --dry-run
npm run sync:export-review -- /tmp/pstack-review-new
npm run sync:apply -- --review /tmp/pstack-review-new --dry-run
```

Protected adaptation changes require an explicit review decision. The updater never silently overwrites them. Ordinary clean updates stay planner-owned.

Exit code 2 is a reconciliation rejection, not a Node or Ubuntu version error. Resolve the listed file conflicts with a fresh export before another update can advance the pin.

Skill links into upstream `pstack/docs/` are rewritten to public GitHub URLs pinned to the imported commit because this package does not bundle those docs.

## Publish an npm release

The `.github/workflows/publish-npm.yml` workflow runs only when a GitHub Release is published. It checks out the release tag and requires `v<version>` to match `package.json` exactly. It verifies the package, runs the real pack gate, then runs `npm publish --access public --provenance --tag omp`. A failed publish fails the workflow. The workflow does not bump versions, push commits or tags, or publish to GitHub Packages. The first release tag for this cutover is `v0.15.13-omp.1`.

Before using the workflow, configure a
[trusted publisher on npm](https://docs.npmjs.com/trusted-publishers/) for
`pstack-pi` with these GitHub Actions settings:

- Organization or user is `JonathanPitre`.
- Repository is `oh-my-pstack`.
- Workflow filename is `publish-npm.yml`.
- Leave the environment name empty.
- Allow direct publishing with `npm publish`.

This is a one-time npm-side setup, not a setting the workflow can create.
If npm requires an existing package before you can configure its trusted
publisher, a package owner must publish the initial version manually first.
The workflow uses GitHub OIDC and does not require an `NPM_TOKEN` secret.

After the version change has been reviewed and merged, create its matching
`v<version>` tag and publish a GitHub Release for that tag. Use a new package
version for each release because npm versions cannot be republished.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes with read-only permissions. It runs verify, verifier/updater/proposal/RPC unit tests, the real package test, bundled Bun tests, and strict typecheck. Model-backed smoke and the multi-host install suite stay separate.
