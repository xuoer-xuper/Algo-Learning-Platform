# S2 Core And S3 Focused Review

- Date: 2026-11-09 (Asia/Shanghai).
- Workspace: isolated release worktree, branch `fix/release-upgrade-safety`.
- Base HEAD: `3702f01ab2d83e73e70c98515cebea829eea19f9`; changes remain uncommitted.
- These are scoped implementation/review results, not final-source or release acceptance.

## S2 Core

Independent review covered connection/migration ownership, verified backup/restore,
typed checkpoints, ledger checks, diagnostics and architecture roots. The resolver,
maintenance CLI and real child-interruption matrix were still in progress and excluded.

The existing credential migration test constructed schema30 then deleted ledger26,
which is not a genuine pre026 source. The new prefix check correctly rejected it before
the intended migration failure. The test now runs frozen known migrations1-25, applies
26 followed by intentional9003 failure, and verifies restored prefix/sentinel, absent
credentials, closed handles, integrity and foreign keys. No production validation was relaxed.

Added a real architecture-runner mutation proving SQL in the new service root is still
rejected with the intended rule/path. It changes reads in a subprocess, not tracked files.

- Focused run: 8 Vitest files / 109 tests passed.
- Production and tests TypeScript checks, scoped ESLint, changed-file formatting passed.
- Architecture runner: 21/21 checks passed.
- No further actionable core finding. No native/full/UI/build/installer gate ran in this review.
- Existing sidecar fault tests preserve opaque synthetic WAL/SHM bytes; they are not proof
  of recovery from a live process interruption. That remains a separate required gate.

## S3 Config Protection

Independent review covered normalization byte backups, staged writeback, failure privacy,
ordinary-save compatibility, export hints and documentation.

Review found descriptor cleanup could mask the primary read/write/fsync failure. Fixed by
preserving primary error classification and retaining close failure as secondary evidence;
eight fault cases were added, with three reproducing before the fix. Uses supported Error
cause/closeError metadata rather than AggregateError (project target is ES2020).

- Focused run: 5 files / 47 tests passed.
- Scoped lint, production/test TypeScript and formatting passed.
- No remaining actionable S3 finding. These checks do not prove packaged installation,
  real-profile compatibility or the unfinished explicit database resolution flow.

## Remaining Integration

Finish and independently review maintenance resolution, run true process termination cases,
then rerun native and full current-source gates. The baseline full run predates hardening.
No commits, remote merges, tags or release upload/publication are established by this record.
