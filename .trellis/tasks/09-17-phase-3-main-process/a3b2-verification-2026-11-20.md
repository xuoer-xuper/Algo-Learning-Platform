# A3b2 First-AC Mutation Verification

Date2026-11-20. Branch codex/drizzle-first-ac, base1a39af0 (PR23 accepted).
Only firstAc.ts production code changes. A3b2 completes submission-domain
queries/writes, not statistics, later domains/layout or the phase3 parent task.

## Accepted Contract

Independent design precheck and explicit PRD/design/spec boundary preceded code.
Raw current-handle SELECT/UPDATEs preserve original state and null-safe predicates,
parent/AC/conditional UPDATE sequence, three eager prepares before complete Set
iteration, exact AC/COUNT(*), native raw times and affected-day order after events.
NoAC avoids UPDATE preparation; present AC and existing recompute parents still
attempt real conditional UPDATEs even on apparent no-op. IGNORE0 emits no event,
FAIL/ABORT native effects differ, and callers own actual savepoints/COMMIT scopes.
No query/types/schema/migrations/validators/timehelpers/orchestration changes.

## Local Evidence

- Implementer frozen old-body oracle and77 differential cases;5focused files132
  tests, both typechecks and scoped lint pass. Six new native groups added.
- Original-body adaptation only DB injection/imports/function names/type erasure
  and an unreachable undefined aggregate guard; original SQL/control-flow/status/
  event/day calculations remain independent of new builders.
- Parent serial test:db35files634tests and actual Electron repositories36/36,
  backupImport11, safety/forced-interruption/recovery/performance matrices pass.
- Parent test:all213files2321tests, repositories36 and UI14 pass, including both
  typechecks/lint, architecture/docs/security/packaging/performance and smokes.
- Coverage75.81/69.98/73.08/78.95; duplicated lines1.75%; no guard relaxed. Existing bundle/
  transition/deprecation warnings remain non-failing.
- build:check and packaged-main native external guard pass. No installer built or
  release/installer acceptance claimed.
- Extra isolated UTC and America/New_York runs each77/77 pass, alongside default
  Asia/Shanghai full gates. Local day/DST tests preserve old/new results.
- All800 product/config/test SHA256 hashes unchanged across gates and timezone
  runs. Original D HEAD20ee62c/62dirty baseline unchanged. Stable dev/master/tag
  remain unchanged; no real user database accessed.
- Logs: ignored algo-electron/tmp/drizzle-a3b2-{focused,typecheck,types,lint,db,all,
  build,tz-UTC,tz-America-New_York}.log and gate-source snapshot.

## Independent Review / Remote Gates

Independent complete-diff review found no actionable issue and made no product/
test changes: both typechecks/scoped lint and6files175tests pass. Two normalized
oracle ASTs and six exact SQL literals match originals. See research/a3b-first-ac-
review.md implementation section. Workeb5103faa9c223224ece4c4a3c8cc6a70e5f7f2a
passed normal commit hooks and immediate full-pre-push test:ci. PR24CI44691480140
passed; squashfa132605f937d49359de74f5c55cefa68e01220a merged into Drizzle with
identical tested tree. PR8 integration CI44692300627 passed. Source800 hashes
still match after hooks; D62dirty and stable release refs are unchanged.
A4a basic reads have an approved design only; A4b/c nullable policy and A4d
migration-coupled recompute remain separate. Phase3 in_progress, PR8 draft/base dev.
