# Installer CI bounded review

Reviewed on 2026-11-10 in the release-2-0-1 worktree, against `58f1e5c`. This review covers the explicit GitHub-hosted Windows installer job, the preparation/guest/helper guards, refusal tests, and their workflow, release-process, packaging and Trellis documentation. It does not repeat the previously completed application/database review or claim that the hosted installer job has already run.

## Findings (fixed)

- File: `algo-electron/tests/packaging/sandbox-upgrade-guest.ps1`
  - Issue: `Start-GuestProcess` inherited the complete parent environment. Although the download `GH_TOKEN` was scoped to the preparation step, ambient Actions authentication variables could otherwise reach installer, application or fixture-helper processes.
  - Fix: remove `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GITHUB_ENTERPRISE_TOKEN`, `ACTIONS_RUNTIME_TOKEN` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN` from each child's `ProcessStartInfo.EnvironmentVariables`. The parent environment and default profile paths are unchanged. Route the Node version probe through the same launcher and verified exit-code check.
- File: `algo-electron/tests/packaging/installerAcceptanceGuards.test.ts`
  - Issue: there was no executable regression assertion for this new hosted-runner credential boundary.
  - Fix: a Windows-only test parses the real PowerShell file, extracts only `Assert-True`, `Start-GuestProcess` and `Get-VerifiedExitCode`, and launches a Node probe with synthetic credentials. Its output contains only presence/preservation booleans. It proves all six keys are absent in the child, default profile/identity variables are preserved, and the parent retains its synthetic credentials. It never executes the installer harness or touches an application profile.

## Findings (not fixed)

No remaining code or documentation defect was found within this bounded scope. Actual hosted execution is still pending and remains a required next step; the passing local guards do not establish an installer acceptance result.

The already documented limitations remain explicit: the checkpoint scenario changes a completed real upgrade checkpoint to prepared and is not a real crash injection; a forced recovery-dialog stop produces `passed-with-limitations` and exit 2; seven-site login/submission, core-page navigation, real credential decryption and final-master release acceptance are not established by this job. No release/publication authorization is implied.

## Reviewed behavior

- The new job requires explicit `workflow_dispatch` with `installer_acceptance=true`, uses a fresh `windows-latest` GitHub-hosted runner, and depends on the existing fast and renderer checks. Default push/PR events do not run NSIS. The ordinary manual full-validation and packaged-smoke jobs are excluded only when this dedicated installer mode is requested.
- Checkout disables persisted Git credentials. Workflow permissions are read-only; the baseline download token exists only on its preparation step. Candidate building retains `--publish never`. No tag, release creation, upload to Release, publication or security-policy modification was added.
- Preparation pins Node 22.23.2, checks a clean checkout including untracked files against `GITHUB_SHA`, verifies candidate assets through the existing asset validator, and downloads the exact published 2.0.0 asset. Baseline size is 121203039 bytes and SHA256 is `5576cab81b879f192b01e5867a81c192297353f3767310efe7f904079d7c6ccc`. The six-file manifest carries candidate/ASAR/runtime/script/helper hashes and clean source identity. Preparation snapshots are compared before/after preparation; `engineering-build.json` says `prepared` and does not claim a build-before/build-after snapshot or acceptance pass.
- The guest checks the actual Windows known folders as well as standard USERPROFILE/AppData locations, rejects existing application profile/installation, and requires exclusive input/output/work siblings directly below RUNNER_TEMP. Path traversal, reparse/link inputs, smoke/runtime overrides and mismatched source/run/owner identities are refused. The standalone helper checks the owner and environment again before every action, checks paths and regular files, and refuses hard links. Sandbox mode retains its fixed WDAG identity and refuses path override arguments.
- The same 26 lifecycle steps and their data assertions remain in place: authentic 2.0.0 install/start/schema29; synthetic closed-profile data and legacy configuration; real candidate upgrade/schema30; restart and newly added data; unresolved-checkpoint refusal and keep-current; actual uninstall retaining profile; reinstall and retained data. The helper does not import application migrations.
- NSIS success requires a completed process with a verified integer exit code of zero plus installed PE versions, registry identity, current-user installation location, shortcut target and ASAR evidence. Candidate ASAR must equal the prepared candidate hash. Uninstall additionally waits for removal of the executable, uninstall registration and shortcut, and requires retained database. No NSIS launch or initial exit alone counts as success.
- Normal startup requires a real main window, responding process, newly written app.ready log event and database, plus the candidate launch-version event where available. Closing verifies the process exit, absence of all application descendants and removal of the session marker before fixture access. Recovery forced-stop limitations and failure exits are retained.
- `Invoke-NormalStartup` returns window metadata and a log filename/hash, not log text. `Get-InstalledEvidence` returns version/path/hash/registry metadata. `Invoke-Data` returns structured helper assertions, ledger/schema/checkpoint information and hashes; configuration, note/script contents and credential-envelope bytes are not returned in the report. Local raw evidence remains outside the upload list.
- The artifact step names exactly three files: `report.json`, `input-manifest.json`, and `engineering-build.json`, retained for 14 days. It does not upload raw logs, configuration, databases, profiles, installers or source snapshots. Early identity/path failures before safe output initialization deliberately produce no report; they still emit a failing PowerShell diagnostic and nonzero workflow step. Later failures persist the report. The artifact action's missing-file setting must not be interpreted as proof that every named summary exists.
- Workflow README, packaging README, release-process documentation and release-evidence spec describe these boundaries. The Git workflow spec now accurately describes both fast and renderer jobs on PR/dev/master and the three explicit manual modes. Candidate-branch engineering evidence is not presented as final accepted master-merge evidence.

## Verification

- Lint: pass — scoped ESLint on both installer `.mjs` files and `installerAcceptanceGuards.test.ts`; Prettier applied to the changed test.
- TypeCheck: pass — `pnpm run typecheck:tests`. No production TypeScript changed in this follow-up. The earlier complete application gate is recorded separately.
- Tests: pass — `pnpm exec vitest run tests/packaging/installerAcceptanceGuards.test.ts`, 14/14, including the real Windows PowerShell process/environment probe.
- Syntax: pass — Node 22.23.2 `node --check` on both installer `.mjs` files; the Windows regression test parses the complete guest PowerShell AST before extracting process functions.
- Diff: pass — `git diff --check`.
- Other-owner evidence reviewed: 20 PowerShell path/refusal probe assertions and workflow YAML/manual-input/job-dependency/token/upload assertions. Those checks are distinguished from this reviewer's directly executed commands.
- Final reviewed guest-script worktree-byte SHA256: `15c4c6fa391b2d1978e8b6a0b539642b863a03f57a343f7d4d202d2265264b63`. Checkout line-ending normalization can change byte identity; the actual hosted run will hash its own input bytes in the manifest.
- No native rebuild, full application suite, UI run, installer execution, profile access or security-policy change was performed by this bounded review. All local check processes have completed. The parent session owns normal Git hooks, push and the actual manual hosted run.
