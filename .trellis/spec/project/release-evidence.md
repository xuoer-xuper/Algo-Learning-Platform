# Release Evidence And Publication

## 1. Scope / Trigger

Applies to preparation, Windows packaging, tagging and GitHub publication. Paths below
are relative to `algo-electron/`. The current reviewed candidate is `2.0.1`, with shipped
baseline `v2.0.0` at `d2d2b0c6b758e1936b00aa602ea172dbb848b065`. These values are explicit
review inputs, not a general automatic version policy. A later release must review and
update the baseline, configs and tests together. Implementation is not publication approval.

## 2. Signatures

Run through pnpm so the CLI can identify its package-manager runtime:

```text
pnpm release:prepare --version 2.0.1
pnpm release:build --identity <identity.json>
pnpm release:check --acceptance <acceptance.json>
pnpm release:draft --acceptance <acceptance.json> --confirm draft-v2.0.1@<masterSha>
pnpm release:verify --acceptance <acceptance.json>
pnpm release:publish --acceptance <acceptance.json> --confirm publish-v2.0.1@<masterSha>
```

`scripts/release-cli.mjs` dispatches to `release-workflow.mjs`; pure identity, asset and
evidence checks live in `release-guards.mjs`. External commands use the injected
`run(command, args, options?)` boundary in tests. The default `.release-it.json` and
`pnpm release` are deliberately not one-command publication entrypoints.

## 3. Contracts

- Prepare only on a clean PR branch, never master/dev. Verify the actual latest stable
  release and baseline tag SHA. `.release-it.prepare.json` may update package metadata
  and reviewed CHANGELOG only; no commit, tag, push or GitHub Release. Use normal hooks.
- Publish only from the exact accepted current `master` tracking `origin/master`, with
  the reviewed two-parent merge: old master first, accepted dev second. Fetch and remote
  identity checks must succeed. Include untracked files in the cleanliness gate.
- Publication retains the npm plugin for package-version discovery but sets
  `npm.publish:false`, `increment:false`, `git.commit:false`, `git.changelog:false`.
  Omit conventional-changelog entirely: its lifecycle can write even without increment.
- All builder commands use `--publish never`. The explicit GitHub provider generates
  `latest.yml` without uploading. There is no electron-updater product claim.
- Identity contains `version`, full lowercase 40-hex `masterSha/sourceSha/targetSha`, and
  64-hex `changelogSha256` of the complete reviewed file.
- `tmp/release-acceptance/build.json` has `formatVersion:1`, `status:passed`, identity,
  exactly `pnpm test:all` then `pnpm build:win`, hashed nonempty gate logs, three asset
  records `{name,size,sha256}` and `asarSha256`. Failed gates never create passed evidence.
- Assets are exactly `AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe`, its `.blockmap`
  and `latest.yml`. Verify both YAML SHA512 locations, installer size/name/version,
  installer/unpacked PE versions, ASAR package identity and accepted hashes.
- Acceptance extends identity with `formatVersion:1`, `releasePr`, `buildReportSha256`,
  `approvedBy`, `publicationAuthorized:true` and eight required gates: independentReview,
  compatibilityReview, isolatedInstallUpgrade, dataPreservation, failureRecovery,
  uninstallReinstall, sevenSitesAndSync, corePages. Each contains `status:passed`, the same
  `sourceSha` as master, a relative report inside the evidence directory, and its SHA256.
  These are maintainer attestations, not automatic proof that human testing happened.
- Verify the merged dev-to-master PR and actual GitHub Actions required checks on the
  accepted dev SHA, plus the fast check on master. API/auth/pagination errors fail closed.
- Release-it creates only a local annotated tag. Its Git init still fetches; do not
  describe it as offline. The wrapper pushes only the exact tag with normal hooks, then
  rechecks evidence and creates a draft with exactly three assets. Avoid release-it's
  remote-tag rollback path by keeping `git.push:false` and `github.release:false`.
- Download and SHA256-check remote assets and annotated tag identity before separate
  public authorization. After PATCH, repeat remote checks. Exclusive draft/publish attempt
  records block blind retries; uncertain external state requires inspection, not rollback.
- Never upload local acceptance reports, private profiles, logs, reusable login state or
  synthetic test databases as release assets. NSIS runs only inside an isolated Windows
  environment; changing APPDATA or `/D=` alone does not isolate registry/shortcuts.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Dirty tracked/untracked source, wrong origin/upstream/SHA/parents | Refuse before release mutation |
| Actual latest stable no longer matches reviewed baseline | Stop and review the next release inputs |
| Missing/extra/empty asset or YAML/PE/ASAR/hash mismatch | No draft/publication |
| Build/test failure or preexisting output/evidence | Preserve evidence; no passed build report or blind overwrite |
| Incomplete acceptance, stale report SHA or escaped path | Refuse; dry-run is not a passed gate |
| Required CI missing, pending, failed or ambiguous | Refuse |
| GitHub/network/auth/ref parsing failure | Refuse; never reinterpret as absent or successful |
| Target local/remote tag or Release already exists | Stop for state inspection |
| Tag push/upload/PATCH result uncertain | Preserve attempts and external state; no automatic deletion/retry |
| Draft assets verified but no separate public approval | Keep draft private; do not PATCH |

## 5. Good / Base / Bad Cases

- Good: reviewed metadata PR, accepted no-ff master merge, final-source test/build evidence,
  isolated installer acceptance, verified draft, then a separately approved public step.
- Base: `release:check` reads evidence and remote state but does not tag/upload; it may
  refresh the remote-tracking master ref.
- Bad: use only release-it's clean check (ignores untracked), build before bump, tag a
  new release commit, assume asset globs uploaded all files, or treat a dry-run as acceptance.

## 6. Tests Required

- `tests/packaging/releaseTooling.test.ts`: injected-runner positive and refusal cases,
  pre-mutation sequencing, build evidence/source recheck, malformed remote responses,
  every asset/hash failure and draft/public authorization separation.
- `tests/packaging/check-packaging.mjs`: safe configs, builder provider and no automatic upload.
- Check installed release-it lifecycle behavior when changing plugins/configuration;
  mocks do not certify its real hooks or Git behavior.
- Full current-source `test:all` includes duplication, native and UI gates. `build:win`
  additionally checks packaged
  main/native/fuses/single-instance behavior.
- Isolated actual NSIS install, shipped 2.0.0 upgrade, data/recovery, uninstall retention
  and reinstall are separate from unpacked smoke. Keep seven-site/sync/core-page manual
  acceptance; distinguish synthetic cases, current checks and justified historical evidence.

## 7. Wrong vs Correct

```text
Wrong: release-it -> bump/commit on master -> build -> wildcard upload -> public release
Correct: reviewed preparation PR -> dev -> no-ff master merge -> final evidence
         -> local annotated tag -> exact normal-hook push -> verified draft -> approval -> public
```
