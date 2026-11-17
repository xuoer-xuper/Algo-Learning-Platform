# Verified Upgrade Recovery

## 1. Scope / Trigger

Applies to production SQLite initialization, interrupted upgrades and explicit local
resolution. Paths below are relative to `algo-electron/`. The legacy connection and
frozen migrations001-030 remain in `electron/db/`. Released v2.0.1 uses format-1
legacy recovery; the Drizzle branch extends it with format-2 composite attempts.
This is not a full-profile backup or evidence that the branch has shipped.
Verification/resolution helpers live in `src/main/db/` and
`src/main/services/backup/lib/`.

## 2. Signatures

```ts
// electron/db/connection.ts
initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations?, drizzle?, logger?, now? }): Promise<Database>
getKnownMigrations(): readonly Migration[]
// electron/backup/sqliteMigrationBackup.ts
createPreMigrationBackup(db, dbPath, backupDir, now?, expectedSource?): Promise<string>
verifyMigrationBackup(path, expectedState?, expectedSha256?): RecoveryDatabaseState
restoreDatabaseFromBackup(path, dbPath, options?): void
// src/main/db/resolve-upgrade.ts
inspectUpgradeRecovery(userData: string, options?): string
resolveUpgrade(userData: string, input: UpgradeMaintenanceRequest, options?): Promise<string>
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
- Format-1 `DatabaseState` retains its exact ordered `{version,name}[]` ledger and
  schema fingerprint algorithm, including optional views/triggers. Do not silently
  reinterpret existing hashes. Format2 excludes only the literal `sqlite_` reserved
  prefix from its schema hash; legal names such as `sqlitex_*` must remain visible.
  Format-2 composite state additionally records exact
  trusted `{tag,when,sha256}[]` Drizzle history; `null` means the ledger is absent,
  whereas `[]` means it exists but is empty. Validate its physical ledger definition
  and all rows, not only the maximum timestamp. Neither ledger is independent proof
  of the target schema. Integrity and foreign keys are also verified.
- Source and target histories must match known contiguous prefixes. Neither can
  regress, at least one must advance, and a Drizzle target requires legacy030.
  Source/target legacy30 with Drizzle advancement is a real protected attempt.
  Optional views/triggers can be fingerprinted by legacy recovery, but Drizzle
  baseline adoption still rejects objects outside its exact physical contract.
- Backup uses SQLite's API into a unique partial, reopens readonly, verifies source
  state/integrity/FK, flushes, promotes and writes a verified manifest. Reject a nonempty
  WAL beside a supposedly standalone recovery point. Failure never starts migration.
- Before the first migration write, persist a versioned checkpoint at
  `<dbPath>.migration-attempt.json`. Fields: UUID attemptId; canonical databasePath and
  backupDirectory; backupBasename/SHA256; source; targetLedger; state; millisecond
  createdAt/updatedAt; optional recovery `{directoryBasename,files}`. Format1 keeps
  its released strict shape. Format2 uses composite source and adds the exact
  `targetDrizzle` prefix. Version backup sidecars and resolution audits as well;
  comparisons, restoration and retention must not discard Drizzle state.
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
  copy using known pending frozen migrations. Format2 also replays the recorded
  Drizzle target, never later migrations known to the current binary. Load trusted
  resources using the same development/packaged provider as startup, validate the
  recorded prefix, stage only that verified prefix in the disposable reconstruction
  directory, and use the official migrator. Record content cannot select SQL paths.
  Current legacy/Drizzle histories, schema, FK and integrity must match. Protect
  current data in `backups/resolutions`, persist a prepared audit, close
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
  source backup, attempt and pending legacy/Drizzle suffixes; associations preserve the raw
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
- Pre-checkpoint Drizzle markers retain optional `pendingMigrationKeys`. These keys
  are evidence, not a condition for blocking: unresolved records block even when
  no pending key overlaps. Explicit association needs a verified source and exact
  ordered keys that prove a known composite target; otherwise preserve the block.
  Never treat empty pending legacy as success for a Drizzle-only failure.
- Production default initialization validates trusted resources before opening
  the user DB; explicit `options.migrations`, including `[]`, remains legacy-only.
  Both routes must check unresolved evidence before opening. Completed/resolved
  format1 records are not rewritten merely because a Drizzle-capable binary runs.
- Files and path components must meet the helper's local/regular/non-link checks. Config
  has separate byte protection. SQLite is not a complete notes/images/scripts/session
  backup; no guarantee of arbitrary lossless binary downgrade or all hardware power loss.

## 4. Validation & Error Matrix

| Condition                                                                     | Required result                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Pragma, history, integrity or backup failure                                  | Close owned connection; no migration/global DB                   |
| Backup, disk, permission, flush, promotion or checkpoint failure              | Keep existing evidence; refuse writes                            |
| Process dies after prepared, within030, between commits or after030           | Restart detects unresolved state, including pending=[]           |
| Restore copy/rename/sidecar/install/verification failure                      | Preserve recovery materials and blocked state                    |
| Close/logging/marker persistence also fails                                   | Retain original error and secondary diagnostics                  |
| Current state equals target, including new rows                               | keep-current protects current data and resolves                  |
| Current state equals source after verified restoration                        | retry-source permits a new attempt, no migration in command      |
| Partial/future/unknown state, wrong UUID, missing audit/recovery              | Refuse resolution and keep startup blocked                       |
| Resolved checkpoint with missing/tampered audit, backup or legacy association | Refuse normal startup; preserve all evidence                     |
| Another instance owns the profile                                             | Maintenance refuses with nonzero exit; no business startup       |
| Ordinary service fails after completed upgrade                                | Keep successful current DB; fix forward                          |
| Source/target legacy30 with baseline or Drizzle-only work                     | Format2 backup/checkpoint protects the full attempt              |
| Drizzle-only data migration leaves schema unchanged                           | Exact Drizzle rows still distinguish source and target           |
| New binary knows migrations after recorded target                             | Bounded replay stops at the recorded target                      |
| Missing/changed Drizzle row, audit identity or resource                       | Refuse resolution/startup without deleting evidence              |
| Existing format1 28-to29 attempt                                              | Verify only29; normal restart separately protects later upgrades |

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
- `migrationInterruption.test.ts`: format1 legacy-only bundled Electron RUN_AS_NODE parent/children,
  flushed rendezvous and parent SIGKILL at four observed stages. No production crash hooks.
  Assert unresolved restart, verified source, controlled source restore, preserved displaced
  files, explicit resolution, later rows and ordinary-startup-failure preservation.
- `drizzleMigrationInterruption.test.ts`: format2 baseline adoption and data-only
  Drizzle work, each killed after durable preparation and after commit before
  completion. Verify no-marker restart blocking, wrong-resolution refusal, exact
  history/audit/current-copy checks, later rows and fresh protected retries.
  Preserve failed synthetic profiles for diagnostics; clean only verified successful cases.
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
