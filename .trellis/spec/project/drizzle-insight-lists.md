# Drizzle Insight List Contracts

## 1. Scope / Trigger

A4c converts four remaining stats insight reads after A4b2 acceptance. Baseline
nullable primary keys require truthful read outputs and collision-safe Dashboard
keys. Parent accepts these bounded consumer corrections. All rows and URL actions
remain; schema, input policies, runtime exporters and recompute stay unchanged.

## 2. Signatures

```ts
getTimeline(limit?: number): TimelineEvent[]
getRevisitStats(limit?: number): RevisitStat[]
getWrongProblems(limit?: number): WrongProblem[]
getUnreviewedProblems(days?: number, limit?: number): UnreviewedProblem[]
```

Limits default50, unreviewed days default30. Timeline/wrong/unreviewed IDs are
string|null; revisit problem_id is string via joined NOT NULL visit FK. All other
keys and raw scalars stay the same. Request IDs/limits and integer time schemas
retain their existing constraints; no output parser is added to repositories.

## 3. Query / Consumer Contracts

- Each read wraps getDb() without caching/opening/closing or writes/events/new
  transactions. Named LIMIT placeholders preserve native negative/NaN/fraction
  behavior; no clamp, decoder, catches or added ordering/filtering.
- Timeline selects exactly id,event_type,occurred_at,platform,url,problem_id.
  Preserve tombstones, nullable IDs and raw occurred_at DESC only.
- Revisit uses active parents INNER JOIN all visits, GROUP BY parent id,
  COUNT(visit.id), raw MAX(entered_at), HAVING count>1/count DESC. Anonymous visit
  IDs do not count but still affect MAX; child tombstones remain included.
- Wrong uses active parents and all nonexact-AC submissions; correlated NOT
  EXISTS excludes any exact AC including tombstoned/anonymous submissions.
  COUNT(child.id) can yield0 for a returned group. Preserve raw MAX(submitted_at)
  and last-attempt DESC. Fixed AC literals do not add bindings; use public alias.
  Nullable parent typing is conservative: this equality join cannot return NULL.
- Unreviewed retains last_visited_at<cutoff and status!='visited', oldest-first,
  SQL CAST((now-last_visited_at)/86400000 AS INTEGER). Prepare before first clock,
  localDateDaysAgo's independent second clock, bounds, then all. Bind ordered
  now/cutoff/limit, bypass Date encoding. NULL visited times remain excluded by
  the original predicate, not an added repair/filter.
- Dashboard model IDs index authoritative shared types; problem-list platform
  pair is required. Wrong/unreviewed keys serialize [platform,platform_problem_id].
  Revisit keeps its proven string key. Timeline keys serialize ['anonymous',index]
  versus ['id',id]; empty ID is identified. Anonymous identity remains positional.
- Keep canonical-URL click/Enter/Space, source arrays/loading-null/empty states,
  layout and timestamp display. AI projections omit local IDs/URLs/payloads as
  before; period counts/export version/privacy allowlist remain unchanged.

URL-based lists differ from recent-list internal-ID actions: nullable local IDs
must not disable canonical-site navigation. The serialized key is view identity,
never a database ID or request value. No requirement for persistent anonymous
identity is implied by this slice's namespaced positional fallback.

## 4. Validation / Error Matrix

| Case | Required behavior |
| --- | --- |
| Multiple NULL timeline/unreviewed IDs | Preserve rows, nullable output, distinct keys |
| Wrong equality join | NULL parents excluded at runtime; type remains conservative |
| Anonymous visit with latest time | Affects raw MAX, not COUNT(id) |
| Anonymous non-AC-only group | Can return wrong_count0 |
| Tombstoned exact AC | Still excludes parent from wrong list |
| Fractional/negative/NaN LIMIT | Original native result/error without numeric-builder omission |
| Broken SELECT and invalid days/clock | Prepare failure wins |
| Two clocks straddle midnight | Elapsed days uses first, cutoff uses second |
| Timestamp fraction/extreme diagnostics | Native raw number retained; no Date conversion |
| Readonly/transactions/close/reinit | Original visibility/errors; no writes/events |

## 5. Good / Base / Bad

Good: projected joined NOT NULL FK as proof, raw aggregate expressions, independent
frozen oracle and explicit key domains. Base: existing baseline scalar contracts,
shared strict input/time validation and original URL navigation. Bad: filtering
NULL rows, invented persistent IDs, COUNT(*) for child counts, calendar days_since,
new verdict lists, disabled URL actions or widened private AI fields.

## 6. Tests Required

Freeze all four old queries independently. Compare complete ordered rows/key
sets/native values/errors and per-read schema/ledger/state/change counters.
Cover default50/ties/native limit edges, literal/Unicode/empty IDs, all count/MAX/
tombstone/anti-AC cases, cutoff equality and two clocks across midnight. Native
Electron groups verify actual better-sqlite3 bindings/errors; mock probes alone
are insufficient. Cover query-only/read-only/current connection and no events.

Shared schemas accept string/null including empty, reject number/object/undefined,
retain revisit string and integer instant/request guards. Real component tests
exercise tuple collisions/reorder/focus retention, URL click/keyboard actions,
anonymous index0 versus real '0', loading/empty and epoch0. AI tests use positive
projection/count anchors plus absent private sentinels. Both types/lint and parent
serial native/full/build gates close acceptance with unchanged schema/030.

Native assertions must use the actual reused outcome helper's discriminant
(submissionReadOutcome returns rows, not value). For LIMIT -0, preserve -0 in
the native binding trace but expect array length +0: Node strict equality
distinguishes signed zero, while an empty array cannot have length -0. A green
Vitest-only suite does not execute repositories.test.ts; run its Electron gate.

## 7. Wrong vs Correct

```ts
// Wrong: numeric builder LIMIT can omit negative/NaN values.
// Correct: .limit(sql.placeholder('limit')).all({ limit })
// Wrong: COUNT(*) counts anonymous visits and changes revisit qualification.
// Correct: count(problemVisits.id), preserving raw MAX independently.
// Wrong: key={event.id ?? index} collides for real '0' and anonymous index0.
// Correct: JSON.stringify(event.id == null ? ['anonymous', index] : ['id', event.id])
// Wrong: compute the cutoff before SELECT preparation or reuse one clock.
// Correct: prepare first, then evaluate ordered now/cutoff/limit bindings.
```
