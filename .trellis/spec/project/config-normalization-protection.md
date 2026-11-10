# Config Normalization Protection

## 1. Scope / Trigger

Applies to automatic startup normalization of an existing `config.json`, not ordinary
user-requested settings saves. Paths below are relative to `algo-electron/`. The legacy
`electron/app/config.ts` remains the owner; new protection helpers use the template layout.
SQLite migration checkpoints do not protect config or a complete user profile.

## 2. Signatures

`src/main/services/backup/lib/config-normalization-backup.ts` exports:

```ts
readConfigNormalizationSource(userDataDir: string): Buffer | null
createConfigNormalizationBackup(userDataDir: string, original: Buffer): string
writeNormalizedConfigWithBackup(
  userDataDir: string,
  original: Buffer,
  serialized: string,
): void
```

The source is fixed to `<userData>/config.json`. The verified original is stored at
`<userData>/config-normalization-backups/config-before-normalization-<sha256>.json`.
Backup staging uses `<backupPath>.<uuid>.partial`; normalized staging uses
`<userData>/.config-normalization-<uuid>.partial`. Callers cannot supply alternate file names.

## 3. Contracts

- Read original bytes before electron-store access. Only readable existing config that
  actually differs from its normalized value enters the protection/write path. Canonical,
  absent and corrupt JSON files remain unchanged with no automatic backup.
- Preserve original bytes exactly, including BOM, whitespace and encrypted envelopes;
  do not parse/decrypt them in the backup helper or log parser fragments/paths/secrets.
- Reuse a content-addressed backup only after reopening and byte comparison. Otherwise
  write exclusively, flush, reopen/compare and promote before attempting source replacement.
- Stage normalized bytes in the source directory, flush/reopen/verify, recheck the original
  and its backup, then rename. Never unlink the source first or fall back to an in-place
  write. Installed conf's EXDEV fallback is not used for automatic normalization.
- On failure keep the existing file and the in-memory normalized fallback; preserve partial
  evidence but never treat `.partial` as a recovery point. No automatic pruning or restoration.
- Ordinary explicit settings saves keep the existing electron-store/error contract. A prior
  normalization snapshot never authorizes overwriting later user settings.
- Reject symlink/junction path components, non-regular and multiply-linked config/backup
  files. POSIX copies/directories are owner-only; Windows uses the inherited profile ACL.
  This does not repair arbitrary ACLs or promise protection from hostile concurrent path swaps.
- A cleanup error must not replace the primary read/write/fsync error. User-facing diagnostics
  carry only allowlisted reason codes, never aggregate error contents or encrypted bytes.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Canonical config, missing config or corrupt JSON | No backup and no automatic write |
| Readable legacy/noncanonical values | Verified byte-identical original before normalization |
| Linked path/file or stale source | Refuse with safe path/source reason; no replacement |
| Existing backup differs or cannot reopen | Refuse; keep source and damaged backup for diagnosis |
| ENOSPC, permission, write, flush or stage verification failure | Keep source; partial stays ineligible |
| Promotion/replacement EXDEV or rename failure | No copy/in-place fallback; original remains |
| Primary operation and descriptor close both fail | Preserve primary classification and secondary evidence |
| JSON parser error contains user data | Log `INVALID_JSON`, never the exception text |
| Explicit save after a protected normalization | Save current requested settings; retain old snapshot unchanged |

Guard codes are `CONFIG_UNSAFE_PATH`, `CONFIG_SOURCE_CHANGED`, `CONFIG_BACKUP_MISMATCH`
and `CONFIG_WRITE_MISMATCH`. Config diagnostics also allow known filesystem error codes,
`INVALID_JSON`, or `UNAVAILABLE`; arbitrary `Error.message` is not a safe diagnostic.

## 5. Good / Base / Bad Cases

- Good: verify a BOM/CRLF legacy file's original byte copy, normalize once, then leave an
  already-canonical second startup untouched.
- Base: first install loads defaults without writing a config until an explicit save.
- Bad: assume an atomic-store library can never write in place, or use a database backup
  as evidence that config, note images, scripts and browser sessions were also protected.

## 6. Tests Required

- `tests/app/configCompatibility.test.ts`: established fields/envelopes, canonical/corrupt
  byte preservation and renderer omission of encrypted key material.
- `tests/app/configMigration.test.ts`: legacy home URL conversion/defaults and ordinary saves.
- `tests/app/configNormalizationBackup.test.ts`: real isolated files, exact raw bytes,
  permission/disk/flush/reopen/promotion/replace faults, EXDEV refusal, stale source,
  linked/multiply-linked paths, primary-versus-cleanup failures and secret-free diagnostics.
- `tests/db/credentialExport.test.ts` and learning-data timestamp compatibility tests keep
  v1/v2 boundaries and the truthful SQLite/JSON-not-full-profile hint.
- Run source/test typechecks, lint and the full integrated gate after review. Focused config
  tests do not certify SQLite recovery, packaged upgrades or NSIS installation.

## 7. Wrong vs Correct

```ts
// Wrong: library fallback may overwrite the original after a cross-device error.
store.store = normalized

// Correct for automatic normalization of an existing readable file:
writeNormalizedConfigWithBackup(userDataDir, originalBytes, JSON.stringify(normalized, null, 2))

// Wrong: parser messages may contain an encrypted envelope or another private value.
log.warn('config.store-unreadable', { error: String(error) })

// Correct: classify locally into the fixed reason-code vocabulary.
log.warn('config.store-unreadable', { reason: configFailureReason(error) })
```
