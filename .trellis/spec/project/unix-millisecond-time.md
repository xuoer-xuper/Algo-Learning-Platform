# Unix Millisecond Contracts

## 1. Scope / Trigger

Apply to persisted instants, main-process events, IPC payloads, export/import and
renderer time displays after migration 030. Paths are relative to `algo-electron/`.
Calendar dates, durations and external protocol validators are different concepts.

## 2. Signatures

```ts
// src/shared/time.ts, pure and renderer-safe
nowMillis(): number
toLocalDay(milliseconds: number): string
formatForDisplay(milliseconds: number, options?: Intl.DateTimeFormatOptions): string
localDayBounds(day: string): { start: number; end: number }
shiftLocalDay(day: string, days: number): string

// electron/shared/legacyTimestamp.ts, legacy boundary only
parseLegacyTimestamp(value: string | number, policy: 'local' | 'utc8', location?: {
  table: string; column: string
}): number
// A null overload preserves legitimate nullable values.
```

The explicit 82-column inventory and fallback policies live in
`electron/db/timestampColumns.ts`. Shared schemas use integer numbers while
preserving optional/nullability. `schema_version: 2` is the canonical learning-data
and AI-context export version; site-config export also uses version 2 metadata.

## 3. Contracts

- Instants are safe integer milliseconds, including epoch zero. Do not treat zero
  as missing, multiply existing milliseconds again, or format dates for storage.
- `local_day`, `snapshot_date`, period start/end date keys stay `YYYY-MM-DD` strings.
  Calendar boundaries account for 23/25-hour DST days. Duration/latency fields keep
  their explicit units; `run_at`, ETag and HTTP Last-Modified are not instants.
- Explicit Z/offset in legacy dates wins. Known suffixless script/credential/runtime
  families use fixed UTC+8; other legacy wall times retain system-local meaning.
  Reject calendar overflow/DST gaps. A DST fold uses JavaScript's earlier occurrence,
  an explicit compatibility choice rather than recovered historical information.
- Early Luogu numeric milliseconds were bound to TEXT and became `.0` strings.
  Only canonical `^-?(0|[1-9]\d*)\.0+$` receives this additional numeric conversion;
  safe-integer and Date bounds still apply. No seconds inference, generic numeric
  string coercion, scientific notation, or fractional precision loss.
- Released migrations 001-029 remain unchanged. Their frozen `nowBeijing` helper
  and the runner's pre-030 TEXT ledger writes are the only legacy clock exceptions.
  Logs, failure audit records and filenames may use explicitly annotated ISO text.
- 030 requires an outer controlled FK-disabled transaction. Disable FK enforcement
  before entering it; rebuild tables and indexes without renaming original tables
  to backup names; prepare the ledger INSERT after rebuilding it; validate FK and
  integrity before commit; restore enforcement on every exit. Preserve the original
  migration error if restoration also fails and never report false completion.
- Stats recomputation accepts an explicit database, not global `getDb()` during
  startup migration. Recompute old and new valid day keys from authoritative facts.
  Only 030 may discard the known ten-digit pseudo-day cache keys produced by old
  numeric-text prefix aggregation; preserve valid-bucket metadata, reject other
  invalid keys, and retain the original database in the pre-migration backup.
- AI JSON conversion touches only versioned known instant paths: `exported_at`,
  `wrong_problems[].last_attempt`, `unreviewed_problems[].last_visited_at`, and
  `recent_activity[].occurred_at`. Preserve arbitrary JSON, Markdown, user strings,
  binary resources and snapshot day labels. Unknown versions/invalid known fields
  abort rather than erase or recursively rewrite content.
- Learning-data v1 is normalized before preview, conflict comparison and import.
  Original v1 metadata may have only `excluded`; absent later metadata gets explicit
  compatibility defaults. Required instants cannot be null; v2 must use numbers.
  Handle direct day keys separately from instant-derived affected days.
- Queries against INTEGER instants bind numeric cutoffs, including non-repository
  consumers such as recent-site preconnect. Never retain `substr(instant,1,10)` or
  `julianday(integer)` semantics. Human-readable Markdown/UI formats only at output.

## 4. Validation & Error Matrix

| Input / condition | Required behavior |
| --- | --- |
| Epoch 0 | Preserve, calculate and display normally |
| Offset/Z date | Same epoch in every host timezone |
| Suffixless known UTC+8 field | Fixed UTC+8, independent of host timezone |
| Legacy integer-ms `.0+` TEXT | Exact numeric milliseconds, no unit conversion |
| Invalid non-null date or unsupported numeric text | Throw safe location-only diagnostic |
| Null in nullable field | Preserve null |
| Null/missing required export instant | Reject before import writes |
| DST gap / fold | Reject gap; documented earlier fold |
| Failed conversion/constraint/commit | Roll back and restore consistent backup; block retry marker |
| FK restoration also fails | Preserve original failure and separately log restore failure |
| Known ten-digit daily cache key | 030-only remove/rebuild from facts, never delete facts |
| Other malformed daily key or unknown AI version | Fail safely without guessing |

## 5. Good / Base / Bad Cases

- Good: upstream seconds are explicitly converted once in an adapter; all later
  repository/IPC/UI arithmetic uses milliseconds and display formats separately.
- Base: old v1 UTC text imports compare equal to equivalent canonical v2 epochs.
- Bad: bind a date label against an INTEGER column, apply truthiness to epoch zero,
  assume all suffixless dates are Beijing time, or clear invalid facts to pass checks.

## 6. Tests Required

- Fresh and pinned reconstructed 21/24/29 upgrades to 30; all 82 declarations and
  non-null storage types, full ledger and repeated startup without repeat backup.
- Three isolated TZ processes (UTC/Shanghai/New York), milliseconds, zero/null,
  invalid dates, DST gap/fold, SQLite numeric-to-TEXT reproduction and safe rejection.
- FK/index/CHECK/UNIQUE/rowid/view/trigger/BLOB preservation; late-column failure,
  prior committed migration restoration and retry blocking.
- Targeted AI JSON and legacy export normalization; no false conflicts or arbitrary
  JSON conversion; stats based on independent fact aggregation and stale-key repair.
- Real-copy evidence uses read-only SQLite backup API, migrates only temporary
  destinations and verifies original DB/WAL hashes unchanged. Report counts and
  pass/fail only, not private row values. Do not claim every nullable column had data.
- Run `test:all`, `build:win` and packaged legacy-upgrade smoke before delivery;
  `test:ci` before push. Preserve the R4 refresh and IPC trust-boundary tests.

## 7. Wrong vs Correct

```ts
// Wrong: date text is not a valid cutoff for INTEGER timestamps.
query.all('2026-11-05')
// Correct: numeric local calendar boundaries, including DST.
query.all(localDayBounds('2026-11-05').start)

// Wrong: epoch zero is valid, not absent.
if (timestamp) render(timestamp)
// Correct:
if (timestamp !== null && timestamp !== undefined) render(formatForDisplay(timestamp))
```
