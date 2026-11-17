# Research: v2.0.1 release tooling

> Historical research copied into the hardening task. Current PRD and `standards-and-policy.md`
> supersede the pending version-policy-exception wording below. Tooling observations remain
> design evidence, not proof of implemented gates or publication authorization.

- Query: Smallest safe two-stage release flow for accepted dev -> master, annotated tag on the merge commit, excluding unmerged Drizzle work.
- Scope: internal; installed dependency source and read-only Git-ref inspection.
- Date: 2026-11-08
- Refs: origin/dev = 3702f01; origin/master and v2.0.0 = d2d2b0c. Current feature tree is not release source.

## Findings

### Publish prepared version without master writes

Use separate standalone preparation and publication configs. Publication must NOT extend a config containing conventional-changelog. Keep npm enabled, with npm.publish=false; top-level increment=false (CLI --no-increment); git.commit=false; requireBranch=master; explicit tagName/tagAnnotation `v${version}`. Omit commitArgs bypass. Explicit GitHub assets must name the exact installer, its blockmap and latest.yml; use a read-only command extracting exactly the prepared version's reviewed release notes.

Installed release-it@21.1.1 evidence:

- `algo-electron/node_modules/release-it/lib/plugin/factory.js:13`: internal plugin order npm, git, github, gitlab, version.
- `algo-electron/node_modules/release-it/lib/index.js:62`: first nonempty getLatestVersion supplies version, so npm wins when enabled.
- `algo-electron/node_modules/release-it/lib/plugin/npm/npm.js:97`: npm supplies package version unless ignoreVersion is set.
- Same file `:105`: no-increment returns before npm version; this is supported no-mutation behavior. `npm.version=false` is NOT supported.
- Same file `:120`: publish=false prevents npm publication; private=true independently suppresses publication. Use explicit false.
- Setting npm=false would be WRONG: Git would supply latest tagged 2.0.0, not prepared package 2.0.1.
- `algo-electron/node_modules/release-it/lib/plugin/GitBase.js:82`: explicit tag template expands independently of historical prefix inference.
- `algo-electron/node_modules/release-it/lib/plugin/git/Git.js:80`: commit=false avoids staging and automatic destructive rollback registration. Lines 91-95 still tag/push; line 191 creates annotated tags.

Proposed invocation after a validated master merge: `pnpm exec release-it -c .release-it.publish.json --no-increment --ci`. This is NOT an accepted executable path until preflight, notes and asset guards are implemented/tested. Validate exact target separately, rather than combining a positional increment/version with no-increment.

### No-increment does not disable changelog mutation

- `algo-electron/node_modules/release-it/lib/index.js:119`: lifecycle still runs beforeBump, bump, beforeRelease with no increment.
- `algo-electron/node_modules/@release-it/conventional-changelog/index.js:293`: beforeRelease writes infile whenever configured and not dry-run, regardless of increment setting.
- Same file `:190`: no-increment changes changelog bounds to latestTag/secondLatestTag; this is not the range for an untagged prepared package version.
- `algo-electron/node_modules/release-it/lib/plugin/Plugin.js:6`: default external-plugin isEnabled always returns true. Do not rely on a false plugin entry; OMIT conventional-changelog from the standalone publishing config.
- `algo-electron/node_modules/release-it/lib/plugin/GitBase.js:43`: default Git changelog special-cases no-increment/no-commit, potentially using HEAD^1. Set git.changelog=false and supply explicit release notes instead.

Preparation can use conventional-changelog on a preparation branch with exact 2.0.1, npm.allowSameVersion=true (package is already 2.0.1), tag/push/GitHub release disabled, and parent-controlled normal commit. Explicitly bind generated notes to actual shipped v2.0.0, review them and preserve history. Do not regenerate the source changelog after merging master.

### Hook order, exact-source and asset guards

Current `origin/dev:algo-electron/.release-it.json:25` builds in before:init, before selecting/bumping a version. Preparation builds belong after target-version writing; publication uses already-committed metadata and validates before any external side effect. beforeRelease precedes Git tag/push: fail-closed preflight and build/asset verification belong before publication. Never reuse the Drizzle branch's existing 2.0.1 installer.

Required assertions:

1. Branch master, clean porcelain INCLUDING untracked, correct origin/upstream, HEAD equals freshly fetched origin/master, merge parents identify accepted source and target.
2. Expected target exactly 2.0.1; source package, top reviewed changelog entry, packaged app.asar package, installer metadata and latest.yml agree.
3. Target tag absent locally/remotely and GitHub Release absent; network/auth/API error must not count as absence. Never overwrite a published tag.
4. Build only from clean accepted source; record HEAD, build evidence and SHA-256 per published asset. Ensure no new tracked changes before tagging.
5. Exactly the expected exe, blockmap and latest.yml exist/nonempty; latest.yml filename, version, size and SHA-512 match the exe. Inspect packaged production fuses, native module, sensitive input exclusions and test output.
6. Required CI and full local acceptance pass; after publication check remote annotated tag commit and all uploaded asset hashes/sizes, not just a successful CLI exit.

Important source caveats:

- `algo-electron/node_modules/release-it/lib/plugin/git/Git.js:126` uses git diff --quiet HEAD, which ignores untracked files. The existing prose claiming requireCleanWorkingDir catches untracked is inaccurate for installed 21.1.1. Add explicit porcelain preflight rather than touching user .zcode.
- `algo-electron/node_modules/release-it/lib/plugin/github/GitHub.js:339` globs all asset patterns together; zero files only warns, partial missing patterns do not fail. Exact asset validation is mandatory.
- `algo-electron/node_modules/release-it/lib/plugin/github/GitHub.js:132` with assets creates draft, uploads, then publishes. Consider retaining draft until post-upload verification for a stronger release gate.
- `algo-electron/node_modules/release-it/lib/plugin/git/Git.js:220` may attempt remote-tag rollback on failed push. Do not blind-retry after partial external effects; inspect remote tag/release state first.

### Generate metadata without builder uploading

Add explicit builder publish provider `{ provider: 'github', owner: 'xuoer-xuper', repo: 'Algo-Learning-Platform' }`, and always invoke release build with `electron-builder --win nsis --publish never`. Merely adding provider while leaving publish policy implicit can upload when token/CI variables are present.

- `algo-electron/node_modules/app-builder-lib/out/publish/PublishManager.js:64`: publish never prevents uploads.
- Same file `:135`: update-info tasks still run for suitable artifact events even when isPublish=false, provided publish configs resolve.
- `algo-electron/node_modules/app-builder-lib/out/publish/updateInfoBuilder.js:72` and `:154`: create and write version/hash metadata; publishAutoUpdate=false would skip writing, so do not set it.
- Existing `origin/dev:algo-electron/tests/packaging/check-packaging.mjs` has eight configuration checks; extend with provider identity, explicit no-upload build, release no-bump/no-commit and exact-assets tests. Current feature test adds Drizzle resources and must not be copied wholesale into release dev scope.

No electron-updater exists in dependencies: latest.yml generation alone does not add automatic update UX. Do not claim it does.

### Branch graph and workspace isolation

Merge base of origin/master and origin/dev is 97fab601, not v2.0.0. Master-only ancestry contains the 2.0.0 release and eight fix branches. HOWEVER those behaviors and tests are present in dev via squash content: ctrl-click uses createPopupTab/outlivesOpener; WebAuthn guard, sessionExitMarker and focus/session tests remain; master-to-dev diff for those is largely formatting/logger/types. Ancestry alone is not evidence of lost fixes. Review merge conflicts/result, preserve both histories, run the shipped-fix regressions, and never resolve by replacing whole files with one side blindly.

`git describe --tags origin/dev` currently finds v2.0.0-rc.1, not v2.0.0. This makes inferred changelog ranges on dev misleading; explicit baseline is essential. The merge commit has both ancestry lines and is the canonical publication point.

Managed release workspace reported by parent: `C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform`, based on origin/dev. Preserve source's six planning edits and .zcode. Git worktrees share refs/config/hooks and cannot normally check out master already active elsewhere; a clean isolated clone is an alternative for the final master publisher. A detached worktree cannot satisfy requireBranch=master without an intentional branch operation by parent. Do not repoint, reset or delete source checkout contents. Install dependencies with frozen lockfile in the actual candidate workspace rather than reusing mismatched Drizzle node_modules blindly.

### Installer validation boundary

`origin/dev:algo-electron/tests/packaging/checkPackagedApp.mjs:208` creates disposable userData for packaged smoke. That validates real unpacked app startup/fuses/native behavior, NOT the NSIS install/upgrade/uninstall wizard.

NSIS `/D=<temp>` alone does not isolate the product: `algo-electron/node_modules/app-builder-lib/templates/nsis/include/installer.nsh:103` writes stable product registry keys, and installer/uninstaller creates/removes real current-user shortcuts and installation state. Use a disposable Windows VM/Sandbox or dedicated isolated Windows account for actual installer acceptance. Do not quietly run production installer in the owner's profile or claim changing APPDATA is sufficient isolation. This research did not launch/install/uninstall anything.

## Files Found

- `origin/dev:algo-electron/.release-it.json`: current release automation and problematic hook.
- `origin/dev:algo-electron/electron-builder.json5`: NSIS/fuses/output configuration; no explicit provider.
- `origin/dev:algo-electron/tests/packaging/check-packaging.mjs`: configuration guards to extend narrowly.
- `origin/dev:algo-electron/tests/packaging/checkPackagedApp.mjs`: unpacked real-app smoke with isolated userData.
- `algo-electron/node_modules/release-it/lib/`: installed lifecycle/npm/git/GitHub implementation evidence.
- `algo-electron/node_modules/@release-it/conventional-changelog/index.js`: changelog mutation behavior.
- `algo-electron/node_modules/app-builder-lib/out/publish/`: metadata-generation versus upload separation.

## External References / Versions

- Installed source inspected: release-it 21.1.1, @release-it/conventional-changelog 12.0.2, electron-builder/app-builder-lib 26.15.3.
- Upstream project URLs from installed metadata: https://github.com/release-it/release-it and https://www.electron.build/ . No external documentation was needed or fetched.

## Related Specs

- `.trellis/spec/project/git-workflow.md`: merge-tag rule, CI/local gates and revised incremental cadence.
- `.trellis/spec/project/domain-rules.md`: immutable shipped migrations, backup and no secret/user-data exposure.
- `.trellis/spec/shared/pnpm-electron-setup.md`: frozen pnpm installation, hoisted layout and native dependencies.
- `docs/OPERATIONS/RELEASE_PROCESS.md`: manual install/upgrade/uninstall and seven-site acceptance remain distinct from automated checks.

## Caveats / Not Found

- No implementation, release command, test suite, merge, push, installer or user database operation was performed.
- User-selected 2.0.1 versus migration030's direct-downgrade limitation remains a material policy decision under the current major-version rule. Parent is handling that explicit risk/scope clarification before implementation; this research does not grant an exception.
- Full manual acceptance, signing status, complete merge resolution and live upload semantics are not established by static source inspection. Do not claim publishing readiness from this report or dry-run alone.
- Final alignment release name remains undecided and must not revert to automatic 3.0.0.
