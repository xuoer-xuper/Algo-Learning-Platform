# Drizzle Submission Write Contracts

## 1. Scope / Trigger

A3b1 converts only upsertSubmission after independently reviewed acceptance of
exact frozen030 physical table/default semantics. A3b2 first-AC writes are not
covered as implemented. General ownership remains in Drizzle Adoption and data
refresh specs. No schema/migrations, recovery, new transaction, directory or
release change. Native diagnostic tests may add ordinary table triggers.

Generated INSERT names16 columns; legacy names14. Explicitly excluded from
universal parity: changed omitted defaults, renamed omitted columns and view
replacements. Startup/adoption compares physical schema with complete legacy
history and recorded Drizzle count<=1; later histories check integrity. Existing
handles and test override initialization do not imply per-write validation.
Never weaken guards or claim arbitrary damaged-schema exact error messages;
qualified column names may differ. Reassess compatibility on future migrations.

## 2. Signatures

```ts
upsertSubmission(data: SubmissionData): boolean
// Existing bus payload contains topics only.
emitDataChanged(['submissions', 'problems', 'stats'])
```

Returnfalse only when duplicate row exists; returntrue after successful INSERT
run, including changes0 under an IGNORE trigger. Exceptions propagate natively.

## 3. Contracts

- getDb then nowMillis once, as before. Prepare named-placeholder SELECT of ID
  before reading platform/key properties. Duplicate uses row presence, not ID
  truthiness, includes tombstones/NULL IDs, and skips INSERT prep/UUID/events.
- On miss prepare typed INSERT first, then evaluate run arguments: UUID followed
  by the original property order, including second platform/key reads. Do not
  cache getters. Preserve fourteen input bindings; generated default0/NULL for
  is_first_ac/deleted_at equals accepted baseline, not arbitrary DDL semantics.
- Raw SQL-wrapped timestamp placeholders bypass Date encoders. Keep raw numeric
  submittedAt and one captured now for both times; ??null retains0/empty strings.
  No validation/coercion/conflict-upsert/RETURNING/cache/extra queries.
- After successful run always emit submissions/problems/stats and returntrue.
  This narrow legacy IGNORE exception overrides generic skip-no-change guidance,
  not permission for new mutations. On native failure no event; FAIL may retain
  preceding trigger effects and autocommit writes are not magically rolled back.
- Caller owns actual transaction/savepoint; withDataChangeTransaction surrounds
  its invocation including COMMIT. Preserve queued topics/rollback suppression,
  listener guarding/reentrancy and existing autocommit partial success.

## 4. Validation & Error Matrix

| Case | Required Behavior |
| --- | --- |
| NULL/empty ID or tombstoned duplicate | false; no UUID, INSERT prep or event |
| Duplicate on query_only or missing unused insert column | Same successful duplicate short circuit |
| Lookup prepare fails | No input getter or UUID; native error propagates |
| INSERT prepare fails | Lookup getters already read; no UUID/insert getters/event |
| INSERT run fails (FK/unique/readonly/ABORT) | UUID once; native error; no event; original state effects |
| IGNORE trigger successful changes0 | true and original topic event, preserve audit effects |
| FAIL trigger after audit side effect | Throw/no event but preserve native statement side effects |
| Outer savepoint/COMMIT failure | Caller rollback and buffered topics discarded |
| Changed omitted default/column/view | Guard rejection evidence; no universal INSERT parity claim |

## 5. Good / Base / Bad Cases

- Good: genuine supported INSERT builder and raw placeholders after explicit
  schema-scope approval; deterministic old-function oracle proves actual rows.
- Base: current native connection and notifications, with no new transaction.
- Bad: fake partial schema/private dialect hooks/raw SQL disguised as builder,
  UUID in values before preparation, or returning false when changes=0.

## 6. Tests Required

Freeze original mutation independently with deterministic test-only clock/UUID.
Compare full stored rows, state effects, event order, return/error identity on
supported fixtures and prepare/getter/UUID traces. Cover null/empty/zero/optional
values/raw time, duplicates and literals, readonly/audit/IGNORE/FAIL/ABORT/FK/
unique failures, transaction/savepoint/real COMMIT failure, lifecycle/no caching.
Native Electron/better-sqlite3 must repeat representative behavior. Pin existing
schema validator rejection of drift separately; do not rewrite errors/guards to
hide excluded differences. Full typechecks/lint/test:db/test:all/build and CI apply.

## 7. Wrong vs Correct

```ts
// Wrong: eq(column, data.platform) before preparing the duplicate lookup.
// Correct: eq(column, sql.placeholder('platform')), prepare, then get({platform: data.platform}).
// Wrong: values({id: crypto.randomUUID()}).run() changes failure ordering.
// Correct: values({id: sql.placeholder('id')}).prepare().run({id: crypto.randomUUID()}).
// Wrong: submitted_at: sql.placeholder('submittedAt') applies a Date encoder.
// Correct: submitted_at: sql`${sql.placeholder('submittedAt')}` preserves raw values.
// Wrong: if (result.changes === 0) return false.
// Correct: preserve successful INSERT run -> emit -> true, even diagnostic IGNORE.
```
