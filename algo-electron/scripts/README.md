# Build And Release Scripts

## Responsibility

These are maintainer CLI entrypoints, not packaged application code. Current release tooling
prepares metadata on a PR branch, builds an accepted master merge without uploads, and gates
draft creation, downloaded-asset verification and separately authorized publication.

## Entrypoints

- `release-cli.mjs`: strict stage/argument parsing, safe child-process execution and environment checks.
- `release-guards.mjs`: exact Git/package/changelog/CI identities, evidence schemas, ASAR/version/YAML/hash validation.
- `release-workflow.mjs`: metadata preparation, serial build evidence, explicit tag push, draft verification and publication.
- `build-demo.js`: legacy evaluation build helper. Demo-key builds must never be public release inputs;
  the production release CLI rejects `ARK_DEMO_KEY`.

Use the package's `release:prepare`, `release:build`, `release:check`, `release:draft`,
`release:verify` and `release:publish` scripts as documented in
[the release process](../../docs/OPERATIONS/RELEASE_PROCESS.md). Default `pnpm release` is inert
and fails with instructions. Publication remains paused until explicit acceptance and authorization.

## Verification And Boundaries

`pnpm run test:release` runs Vitest with injected fake external commands; `pnpm run test:packaging`
checks the configs. Neither performs real publication, native rebuilding or installer acceptance.
Normal hooks remain enabled; never retry a failed remote mutation blindly or automatically delete
remote tags. Inspect retained local attempt records and remote state first. Evidence stays under
ignored `tmp/release-acceptance/`; only the three exact public artifacts are uploaded.

Candidate/baseline are deliberately pinned to 2.0.1/v2.0.0. A later release requires a reviewed
update of VERSION/BASELINE, preparation config and tests, not an inferred nearest RC tag.
The preparation guard fails when the latest published stable baseline has moved.
