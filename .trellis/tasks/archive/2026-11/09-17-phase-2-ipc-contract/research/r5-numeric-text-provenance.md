# Research: Historical Numeric Milliseconds Stored as TEXT

- Query: Can Git history explain 13-digit decimal-zero timestamp strings found by the parent in isolated copies of schema24/29 databases, without guessing seconds or repairing unknown user data?
- Scope: Internal, read-only Git source inspection plus a synthetic in-memory SQLite affinity probe. No private database was opened by this researcher; no application code or Git state was changed.
- Date: 2026-11-05

## Findings

### 1. A definite historical Luogu writer emitted numeric milliseconds

Commit `5f0c96c92235481c6e0d315d6d696d51cd54babd`, dated 2026-06-07, introduced Luogu support. Its source at:

`5f0c96c:algo-electron/electron/submissions/scrapers/domScraper.ts:487`

contains:

```ts
submittedAt: r.submitTime ? r.submitTime * 1000 : nowBeijing(),
```

The surrounding result is cast `as any`, so the nominal string timestamp contract did not prevent the numeric value. `r.submitTime` is converted from upstream seconds to **milliseconds before storage**. This is explicit source evidence, not a magnitude-based inference from current rows.

### 2. The number was bound unchanged to TEXT and propagated to first AC

The same commit contains the complete persistence chain:

| Historical source | Evidence |
| --- | --- |
| `algo-electron/electron/submissions/syncService.ts:277` | Calls `upsertSubmission(sub)` without reformatting the timestamp |
| `algo-electron/electron/db/repositories/submissionRepository.ts:27` | Passes `data.submittedAt` directly to the SQLite `.run(...)` binding |
| `algo-electron/electron/db/migrations/002_submissions.ts:16` | Declares `submitted_at TEXT NOT NULL` |
| `algo-electron/electron/submissions/syncService.ts:280` | Calls `updateFirstAc(sub.problemId)` for a new linked AC |
| `algo-electron/electron/db/repositories/submissionRepository.ts:58` | Selects stored `submitted_at` from the earliest AC |
| `algo-electron/electron/db/repositories/submissionRepository.ts:65` | Writes that exact value into `problems.first_solved_at` |
| `algo-electron/electron/db/migrations/001_initial.ts:23` | Declares `first_solved_at TEXT` |

All rows in this table refer to commit `5f0c96c92235481c6e0d315d6d696d51cd54babd`. The source therefore explains why the parent observed the same unusual spelling in both submissions and derived first-solved values.

### 3. The producer was fixed before v1.0.0, not the existing rows

Commit `5207d3af406e79037adbf73ec2fdb552d07f1ce6`, dated 2026-07-01, extracted/refactored the scraper. At:

`5207d3a:algo-electron/electron/submissions/scrapers/luoguScraper.ts:213`

the producer becomes:

```ts
submittedAt: record.submitTime
  ? toBeijing(new Date(record.submitTime * 1000))
  : nowBeijing(),
```

The diff removes the direct numeric assignment from `domScraper.ts` and adds the formatted assignment to `luoguScraper.ts`. That is why inspecting only the v1.0.0 tag sees the corrected writer and misses this earlier format. The correction is a writer change; the inspected change contains no conversion of existing stored timestamps. Existing rows can survive into later schema24/29 databases.

### 4. Synthetic native SQLite probe exactly reproduces decimal-zero TEXT

Using the installed `better-sqlite3` runtime (SQLite 3.53.4), the researcher executed only an in-memory synthetic example:

```ts
db.exec('CREATE TABLE submissions (submitted_at TEXT NOT NULL)')
db.prepare('INSERT INTO submissions VALUES (?)').run(1768443630123)
```

The returned row was:

```json
{"submitted_at":"1768443630123.0","storage":"text"}
```

Copying that returned string into a synthetic `problems(first_solved_at TEXT)` produced the same `"1768443630123.0"` string. The example number is synthetic and was not taken from user data. This demonstrates that the historical numeric binding plus SQLite TEXT affinity is sufficient to produce the observed shape.

### 5. Compatibility recommendation

The migration may explicitly support canonical integral-millisecond numeric TEXT, including the observed `.0` suffix, as a known legacy representation. Its value is already milliseconds: **do not multiply by 1000**, infer units from string length, or attach a local/UTC+8 timezone offset to it.

Use a narrow decimal grammar, reject nonzero fractional milliseconds, nonfinite/out-of-range/unsafe integers, and preserve the existing strict date parser for formatted strings. Whether the supported grammar also includes sign/zero/plain integer spelling should be explicit in the executable contract; it must not become permissive `Number(anyString)` parsing or scientific-notation/seconds heuristics.

Required regression: bind a synthetic JS millisecond number into a legacy TEXT timestamp column, verify its actual stored text spelling, run030, and assert the identical integer epoch in both submission and derived first-solved columns. Test that an existing numeric millisecond string is not scaled and that fractional/unsafe numeric strings still fail safely.

## Files Found / Code Patterns

- `5f0c96c:algo-electron/electron/submissions/scrapers/domScraper.ts:487`: original numeric Luogu producer under `as any`.
- `5f0c96c:algo-electron/electron/db/repositories/submissionRepository.ts:6`: direct insert binding; `:53` starts the derived first-AC copy path.
- `5f0c96c:algo-electron/electron/submissions/syncService.ts:277`: service composition proving the producer reaches both writes.
- `5f0c96c:algo-electron/electron/db/migrations/001_initial.ts:23` and `002_submissions.ts:16`: TEXT affinity declarations.
- `5207d3a:algo-electron/electron/submissions/scrapers/luoguScraper.ts:213`: corrected formatted writer in the pre-v1 refactor.

## Related Specs / External References

- `.trellis/spec/project/historical-database-fixtures.md`: pin Git evidence and distinguish synthetic probes from real user-data provenance.
- `.trellis/spec/project/domain-rules.md`: do not mutate originals or silently discard invalid data.
- `.trellis/spec/shared/timestamp.md`: canonical Unix millisecond target.
- No external/web references were required. Runtime probe used installed native SQLite 3.53.4 and a new in-memory database.

## Caveats / Not Found

- This researcher did not read the private schema24/29 copies or any raw submission payload. Counts/shapes supplied by the parent are not re-reported as independent private-data inspection.
- Git and the synthetic probe prove a supported historical production path and the exact spelling mechanism, not which individual user action created each real row.
- The probe uses the current SQLite runtime; it is not a claim that every older installer used the same native binary. The original code clearly bound a number into a TEXT column, and the observed private-copy format is consistent with that path.
- No parser, migration, test or spec was edited. Parent/implementer must make the contract change and verify full rollback/real-copy paths.
