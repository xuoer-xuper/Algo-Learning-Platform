# A5c Test Boundary Retrospective

Date: 2026-11-28. Test-only issues; no production regression established.

## 1. Root Cause Category

- E / implicit assumption: the older SQL observer recognizes unqualified id but
  not public-builder notes.id, so tracing and failure injection disappear.
- D / integration coverage: the new focused DELETE suite passes independently;
  only the retained A5a suite exposes the observer mismatch in six cases.
- E / observation scope: reinitialization legitimately calls the migration clock;
  a blanket no-clock assertion mistakenly attributes setup to deletion.

## 2. Why Fixes Failed

No repeated product fixes or speculative retries were attempted. The first core
47/48 failure and independent303/309 failure are retained. Each causal test
correction passes on its first targeted rerun; final serial DB/full/build passes.
The migration-clock pitfall previously appeared in A5a and is now an explicit
executable testing rule rather than only an old session observation.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Integration regression | Always run prior A5a/B focused suites with new slice | Done |
| P0 | Explicit observer scope | Accept only id or notes.id; preserve traces/injections | Done |
| P0 | Protected-file accounting | Keep60original hashes;59exact plus one authorized edit | Done |
| P1 | Operation boundaries | Assert before reinit, clear only setup, then assert deletion | Done |
| P1 | Spec capture | Record both rules in project/drizzle-notes-delete.md | Done |

## 4. Systematic Expansion

The pending content UPDATE also changes generated statement shape and parameter
order. Do not simply broaden its observer or weaken expected binding assertions:
first prove an independently accepted native contract. A SQL spelling difference
in a test observer is not the same as an observable native bind-order difference.
No new generic parser, relaxed scanner, skipped suite or production workaround
is justified by these two local test defects.

## 5. Knowledge Capture

- Executable deletion spec contains qualifier handling, exact exception and
  no-clock operation-boundary rules.
- Verification and independent review retain initial failures and final evidence.
- Template guidelines remain untouched; these are project-specific tests, and
  this application repository has no generated template spec to synchronize.
