# Historical Database Evidence

## 1. Scope / Trigger

Use when an old user database is unavailable, testing an upgrade from a released
schema, or changing timestamp interpretation. A Git tag identifies source code,
not the provenance or contents of a user's database.

## 2. Signatures

- Regeneration: `node tests/db/regenerateHistoricalFixtures.mjs` from
  `algo-electron/`; reads fixed Git commits, not the current branch's old-looking
  files, and runs only migration exports and their required helpers.
- Regression: `pnpm vitest run tests/db/historicalUpgradePath.test.ts`.
- Upgrade entry: `initDbAtPathWithMigrationSafety(path, { backupDir })`; always use
  isolated temporary paths in tests.

## 3. Contracts

- Classify evidence explicitly as historical source, reconstructed schema with
  synthetic data, or a real user-data copy. Never describe reconstruction as an
  authentic historical user database.
- A reconstruction manifest pins the commit, package version, migration ceiling,
  source Git blob/SHA256 hashes, and generated snapshot hash. Tag labels alone are
  insufficient: `v1.1.0-beta.2` actually contains package version `2.0.0-beta.2`.
- Regeneration may read Git. Normal tests consume committed text snapshots and
  deterministic seeds without Git history, tags, network or private data.
- Do not execute historical application/bootstrap/connection modules. Load only
  the historical migration dependency closure and execute against a temporary or
  in-memory SQLite database. Do not mutate released migrations to make tests pass.
- Never commit SQLite binaries; the repository's security gate forbids them.
  Schema SQL, provenance and synthetic seeds are reviewable text inputs.
- A schema built by replaying migrations on an empty database does not prove old
  data-repair migrations on populated pre-release databases. State that limit and
  add targeted migration tests when that behavior matters.
- A 21/24/29 to 29 test is fixture groundwork, not proof of migration 030. Add
  millisecond conversion assertions when the real migration exists.

### Timestamp provenance established from Git

- `v1.0.0` (`0758b253`) uses system-local components in `nowBeijing/toBeijing`;
  function names do not imply fixed UTC+8.
- The v1.0.0/beta.2 user-script writer uses `toISOString()` with `Z`.
  `e35212b` changes script writes to fixed UTC+8 wall time without a suffix.
  Honor explicit offsets first; only suffixless script metadata uses the fixed
  UTC+8 policy. It is not a known mixture of two suffixless script formats.
- Credential/runtime tables were introduced with the fixed UTC+8 writers.
  Ordinary local timestamps retain their documented local-time interpretation.
- Early Luogu commit `5f0c96c` bound `submitTime * 1000` directly into a TEXT column.
  SQLite preserves such native numeric bindings as decimal integer text ending in
  `.0`. Explicitly support canonical `^-?(0|[1-9]\d*)\.0+$` as milliseconds after
  safe-integer/Date-range checks; never multiply again or infer seconds by length.
  Plain numeric strings, nonzero fractions and overflow remain rejected. Both
  real-copy evidence and an independent in-memory TEXT-affinity regression pin it.
- Old `substr(timestamp, 1, 10)` aggregation produced ten-digit pseudo-day keys
  from those numeric TEXT values. Migration 030 alone may remove that exact
  derived-cache shape and rebuild from authoritative fact timestamps, including
  orphaned stale buckets. Preserve valid-day metadata and the original backup;
  reject other malformed day keys. Never reinterpret the digits as a calendar day
  or delete fact rows to satisfy migration checks.
- Historical VJudge passthrough strings do not record the source timezone. Do not
  invent per-row provenance; retain/document the existing local interpretation
  for suffixless values unless explicit offset evidence exists.
- Released migrations still import the legacy local formatter. Runtime migration
  compatibility is a separate contract from removing legacy helpers in new code.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Original old user database unavailable | Reconstruct a labeled test fixture from pinned source |
| Tag/package versions differ | Record both, do not silently relabel the source |
| Snapshot/source hash differs | Fail regeneration verification or require explicit review |
| Normal CI has shallow/no historical Git data | Fixture tests still run from text inputs |
| Historical helper dependency changed at HEAD | Resolve it from the same pinned commit |
| Historical migration imports app startup or external package unexpectedly | Stop reconstruction; do not silently use current code or a stub |
| Invalid non-null legacy time | Abort conversion safely; do not coerce to NULL |
| Synthetic fixtures pass | Report only reconstructed-path evidence, not real-data proof |

## 5. Good / Base / Bad Cases

- Good: pin source plus helper hashes, regenerate schema twice identically, seed
  representative relations and timestamp formats, then run the real upgrade API.
- Base: existing real version-24/29 copies supplement the reconstruction after
  isolated safe-copy validation; original files are never migrated in place.
- Bad: demand an irrecoverable historical user database as the only way forward,
  replay current migrations and call them exact old code, or rename generated
  data as a real v1.0.0 backup.

## 6. Tests Required

- Verify ledger ceiling and schema snapshot hash before opening the upgrade path.
- Check representative row values, FK integrity, partial indexes, unique/CHECK
  constraints, backup creation and repeated initialization/idempotence.
- Keep UTC `Z`, explicit offsets, system-local and fixed UTC+8 fixtures distinct.
  Test timezone changes, milliseconds, nullable values and invalid values when
  implementing conversion, not just schema reconstruction.
- Re-run the generator and compare bytes. Regeneration must not touch source
  worktree files outside its owned text outputs or access private user profiles.

## 7. Wrong vs Correct

```text
Wrong: tests/db/fixtures/v1.sqlite is a real historical user database (generated today).
Correct: schema21 was reconstructed from commit 0758b253; its rows are synthetic.

Wrong: all suffixless values are UTC+8 because the function is named nowBeijing.
Correct: inspect the pinned writer; local Date getters and UTC+8 shifting differ.
```
