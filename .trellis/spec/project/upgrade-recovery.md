# Verified Upgrade Recovery

## 1. Scope / Trigger

Applies to production SQLite initialization, interrupted upgrades and explicit local
resolution. Paths below are relative to `algo-electron/`. The legacy connection and
frozen migrations001-030 remain in `electron/db/`; no Drizzle or full-profile backup
is introduced. New verification/resolution helpers live in `src/main/db/` and
`src/main/services/backup/lib/`.

## 2. Signatures

```ts
// electron/db/connection.ts
initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations?, logger?, now? }): Promise<Database>
getKnownMigrations(): readonly Migration[]
// electron/backup/sqliteMigrationBackup.ts
createPreMigrationBackup(db, dbPath, backupDir, now?, expectedSource?): Promise<string>
verifyMigrationBackup(path, expectedState?, expectedSha256?): DatabaseState
restoreDatabaseFromBackup(path, dbPath, options?): void
// src/main/db/resolve-upgrade.ts
inspectUpgradeRecovery(userData: string): string
resolveUpgrade(userData: string, input: UpgradeMaintenanceRequest): Promise<string>
// src/main/services/backup/lib/upgrade-resolution-audit.ts
assertFailureMarkerMatchesCheckpoint(marker, checkpoint): void
readVerifiedResolutionAudit(checkpoint): ResolutionAudit
verifyLegacyFailureAudit(checkpoint, failure): void
```

Restore options are `attemptId`, `expectedSource`, `expectedSha256` and
`beforeDisplace(recovery)`. The caller owns closed handles and durable restore intent.
The public maintenance invocation is:

```text
AlgoLearningPlatform.exe --resolve-upgrade=<UUID> --resolution=keep-current|retry-source
```

It only derives `data/algo-learning.sqlite` and `backups/` from the current app profile.
No database/backup/profile path flags or smoke redirection are accepted. Main acquires
the single-instance lock and executes maintenance before normal theme/config/services,
IPC/window/lifecycle startup, then shows the outcome and exits. Restart is explicit.

## 3. Contracts

- Check unresolved attempts before opening the database. All failures after opening,
  including pragma/ledger failures, close the owned handle without replacing the primary
  error. Keep close, restore, marker and logging errors as secondary diagnostics.
- Production history must be an exact continuous known version/name prefix; unknown,
  future, wrong-name, gap or populated-unversioned sources fail before migration or orphan
  cleanup. Explicit `options.migrations`, including `[]`, is a test seam, never a way to
  bypass unresolved records. Frozen historical migrations and fixtures stay unchanged.
- `DatabaseState` contains ordered `{version,name}[]` ledger and SHA256 of ordered
  physical schema entries, including optional views/triggers. A current ledger is not
  independent proof of the target schema. Integrity and foreign keys are also verified.
- Backup uses SQLite's API into a unique partial, reopens readonly, verifies source
  state/integrity/FK, flushes, promotes and writes a verified manifest. Reject a nonempty
  WAL beside a supposedly standalone recovery point. Failure never starts migration.
- Before the first migration write, persist format1 checkpoint at
  `<dbPath>.migration-attempt.json`. Fields: UUID attemptId; canonical databasePath and
  backupDirectory; backupBasename/SHA256; source; targetLedger; state; millisecond
  createdAt/updatedAt; optional recovery `{directoryBasename,files}`.
- `prepared`, `restoring`, `restored` and `restore-failed` block normal startup, even if
  no migrations remain. `completed`, `resolved-keep-current`, `resolved-retry-source`
  are resolved states. An unresolved predecessor cannot be replaced by a new attempt.
  Archive resolved attempts before creating the next. Malformed records fail closed.
- Completion is after migration, orphan cleanup and integrity checks, before exposing
  the global DB. Later business/service/retention errors never restore an old snapshot.
- Caught failure restores only this unexposed attempt, after a confirmed close. Verify
  and stage a source copy, persist intent, preserve closed main/WAL/SHM in the exact
  sibling `<db basename>.recovery-<attemptId>`, then install/reverify. Multi-file rename
  is not atomic; interrupted partial sets remain blocked and are not guessed or deleted.
- Rotation runs after successful initialization, validates the full candidate set before
  deletion, keeps three verified backups plus the pinned current recovery point, and
  leaves partial/unverified materials alone. An unresolved attempt pins all evidence.
- `keep-current` verifies the source hash and builds the expected target on a disposable
  copy using known pending frozen migrations. Current ledger/schema/FK/integrity must
  match. Protect current data in `backups/resolutions`, persist a prepared audit, close
  orphan visits transactionally, reverify/close, persist verified audit, then resolve.
  It preserves rows added after migration and never copies the old source over live data.
- `retry-source` requires exact source state and recorded recovery files, protects current
  data and records resolution without migrating. The next normal startup creates a fresh
  protected attempt. Correct the original failure first. Partial states remain blocked.
- Repeat resolution rechecks matching state, source/current/audit and backup evidence.
  An opposite resolution, wrong ID or completed ordinary attempt is refused.
- Normal startup independently revalidates resolved checkpoints against the matching
  verified resolution audit and protected current-data backup. A resolved state string
  alone never authorizes startup. Failure markers must identify the same database,
  source backup, attempt and pending ledger; legacy associations also preserve the raw
  original marker hash. If startup was interrupted after archiving a resolved marker
  but before replacing its checkpoint, read the exact attempt-linked archived marker
  and repeat these validations before proceeding.
- A legacy marker is inspected readonly: validate profile identity, known standalone
  source and pending known history. Derive deterministic UUIDv5 from profile identity
  and original marker SHA256. Only an explicit matching command preserves exact raw
  marker bytes, creates linkage/checkpoint and adds attemptId to the retained marker.
  Interrupted association is repeatable; missing or mismatched audit is not ignored.
- Legacy target history is the verified source plus its original nonempty pending
  list, which must be an exact known continuous prefix. A 2.0.0 marker can only target
  up to029; never require that old writer to know030. Replay only the recorded source
  to target range. For a historical target below the current schema, explicit resolution
  does not run current-schema orphan cleanup; normal restart creates a new protected
  upgrade before business cleanup. Unknown names, gaps and empty legacy attempts fail.
- Files and path components must meet the helper's local/regular/non-link checks. Config
  has separate byte protection. SQLite is not a complete notes/images/scripts/session
  backup; no guarantee of arbitrary lossless binary downgrade or all hardware power loss.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Pragma, history, integrity or backup failure | Close owned connection; no migration/global DB |
| Backup, disk, permission, flush, promotion or checkpoint failure | Keep existing evidence; refuse writes |
| Process dies after prepared, within030, between commits or after030 | Restart detects unresolved state, including pending=[] |
| Restore copy/rename/sidecar/install/verification failure | Preserve recovery materials and blocked state |
| Close/logging/marker persistence also fails | Retain original error and secondary diagnostics |
| Current state equals target, including new rows | keep-current protects current data and resolves |
| Current state equals source after verified restoration | retry-source permits a new attempt, no migration in command |
| Partial/future/unknown state, wrong UUID, missing audit/recovery | Refuse resolution and keep startup blocked |
| Resolved checkpoint with missing/tampered audit, backup or legacy association | Refuse normal startup; preserve all evidence |
| Another instance owns the profile | Maintenance refuses with nonzero exit; no business startup |
| Ordinary service fails after completed upgrade | Keep successful current DB; fix forward |

## 5. Good / Base / Bad Cases

- Good: interrupted final commit is verified against a replayed target and retained with
  keep-current; later user data remains after normal restart.
- Base: an already-current database with no unresolved record starts without another
  migration backup. A historical known prefix receives a fresh verified recovery point.
- Bad: clear a marker because pending=[]; infer schema from version alone; delete WAL/SHM
  before replacement; let a cleanup error hide the migration failure; retry by deleting audit.

## 6. Tests Required

- `databaseInitialization`, `sqliteMigrationBackup`, `migrationCheckpoint`, `migrateLogging`:
  real isolated SQLite/files plus faults for every lifecycle and secondary-error boundary.
- `resolve-upgrade` and `mainStartupContract`: exact source/target, source tamper, audit,
  legacy association, CLI and single-instance/no-normal-startup behavior. Verify both
  explicit resolution and later normal startup reject missing or mismatched evidence;
  the marker-archive/checkpoint-replacement crash window remains recoverable.
  Include actual legacy prefix28 -> target29 markers for both resolutions and the
  subsequent protected upgrade to30; synthetic pending30 alone cannot prove2.0.0
  failure-marker compatibility.
- `migrationInterruption.test.ts`: bundled real Electron RUN_AS_NODE parent/children,
  flushed rendezvous and parent SIGKILL at four observed stages. No production crash hooks.
  Assert unresolved restart, verified source, controlled source restore, preserved displaced
  files, explicit resolution, later rows and ordinary-startup-failure preservation.
- `historicalUpgradePath` and native `migrationSafety`: pinned21/24/29 source schemas,
  real SQLite ABI, time/data/constraint preservation. Synthetic rows remain labeled synthetic.
- `pnpm test:db`, complete current-source gate, packaged upgrade and isolated NSIS lifecycle
  are distinct evidence. Mocked sidecar bytes or exit0 without test output prove neither crash
  recovery nor installer acceptance.

## 7. Wrong vs Correct

```text
Wrong: pending=[] -> delete failure marker -> expose DB
Correct: unresolved record -> block -> verify source/target and current protection
         -> explicit durable resolution -> normal restart

Wrong: post-upgrade business failure -> restore old snapshot
Correct: successful upgrade boundary -> preserve current data -> forward repair
```
