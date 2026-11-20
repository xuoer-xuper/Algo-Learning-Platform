# Drizzle Submission Read Contracts

## 1. Scope / Trigger

A3a converts four submission reads after the problem-query migration. Preserve
actual legacy rows/errors and correct reachable nullable output declarations.
Mutation/first-AC writes, schemas/migrations, renderer behavior, directory layout
and release are out of scope. General lifecycle/ORM contracts remain in
[Drizzle Adoption](./drizzle-adoption.md). Frozen design/research live in the
phase3 task's `research/a3-submission-queries{,-review}.md`.

## 2. Signatures

```ts
// A3a full raw submission rows and conservative grouped nullable key.
getSubmissionsByProblem(problemId: string): SubmissionRow[]
getSubmissionsByProblemAsc(problemId: string): SubmissionRow[]
getSubmissionsByPlatform(platform: string, limit?: number): SubmissionRow[]
getFirstAcByProblemIds(problemIds: string[]): { problem_id: string | null; first_ac_at: number }[]
```

Authoritative SubmissionRow derives all16 columns from `submissions.$inferSelect`,
overriding submitted_at/created_at/updated_at to number and deleted_at to
number|null. The grouped key derives from SubmissionRow.problem_id. Shared
TimelineSubmissionPoint.submission_id allows string|null; public metrics IDs,
request IDs and integer time schemas stay unchanged.

## 3. Contracts

- All three full-row queries preserve every baseline submission field and raw
  number/null timestamps. SubmissionRow is schema-derived; ProblemSubmissionRow
  aliases it. Do not lose is_first_ac/deleted_at, coerce ID/time, add tombstone
  filters, joins, new sort ties or a cap to the problem-specific readers.
- Platform reads use the same named LIMIT placeholder contract as A2g. Empty
  first-AC batches return before getDb/prepare, including closed/broken states.
- Nonempty first-AC batch binds one variable per input element, including
  duplicates; genuine IN and GROUP BY remain. The fixed verdict='AC' SQL literal
  must not become a bound parameter, or SQLite's native variable-limit error
  shifts by one. No batching/dedup/normalization. Raw sql MIN avoids both Date
  column decoding and String decoding of Drizzle's generic min helper.
- Keep inferred aggregate problem_id nullable; widen only the internal Coach
  Map key. Outward metrics still map the already string-only input IDs. The
  read-only timeline submission_id output permits null without changing renderer
  actions/keys, request IDs or integer-time validation. ContextGatherer's last10
  ascending allowlist stays exact; new full-row fields never leak into prompts.
- Every nonempty read wraps the current lifecycle-owned connection and remains
  synchronous/no-write/no-event/no-transaction; no catches or cached adapter.
  Submission mutation and first-AC update semantics remain a separate slice.

## 4. Validation & Error Matrix

| Case | Required Behavior |
| --- | --- |
| Empty first-AC batch before init / after close | Return[] without acquiring/preparing a database |
| Submission full row / timeline NULL ID | Preserve all16 fields; timeline permits null; request IDs stay strict |
| First-AC duplicate IDs at native bind maximum | Exactly original bind count; max works, max+1 fails identically |
| Fractional/zero first-AC minimum | Raw numeric value, not Date truncation or String decoding |
| Submission row contains private extra fields | Existing ContextGatherer allowlist/last10 unchanged |
| LIMIT NaN/fractions/infinities | Same native error name/message/code; never omitted/clamped |
| SQL preparation/step failure or closed DB | Synchronous native failure; no empty-result fallback |
| query_only or caller-owned transaction | Same rows/visibility; no writes/events/new transaction |

## 5. Good / Base / Bad Cases

- Good: full raw projection preserves all16 fields, and a type-only alias avoids
  a duplicate manually maintained submission row declaration.
- Base: same existing getDb connection and query order/direction, with empty
  aggregate short-circuit before acquiring it.
- Bad: add a bound AC value, chunk/deduplicate input arrays, decode raw MIN into
  Date/String, filter nullable IDs or expand the LLM privacy projection.

## 6. Tests Required

A3a freezes all four original submission reads independently and compares full
rows/keys and native errors. Cover default/edge LIMITs, duplicate/case/NULL batch
keys, raw MIN, native variable maximum/one-over, tombstones, read-only/no-events,
transaction visibility/rollback and close/reinit/empty short circuit. Coach tests
pin nullable timeline ID, unchanged string metrics IDs/zero minima and LLM privacy.

## 7. Wrong vs Correct

```ts
// Wrong for legacy first-AC batch: eq(submissions.verdict, 'AC') adds a bind.
// Correct: fixed sql`${submissions.verdict} = 'AC'` plus inArray for user IDs.
// Wrong: min(timestampColumn) or min(rawExpression) decodes Date/String.
// Correct: raw sql<number>`MIN(${submissions.submitted_at})` for nonempty NOT NULL groups.
// Wrong: make the new nullable aggregate key a fake sql<string> projection.
// Correct: select the schema column; widen only the internal Map key while
// constructing public metrics from the existing string-only input list.
```
