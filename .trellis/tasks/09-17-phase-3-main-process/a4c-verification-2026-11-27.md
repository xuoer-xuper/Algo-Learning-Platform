# A4c Insight List Verification

## Scope And Base

Branch codex/drizzle-insight-lists starts at93c0df29655492fcb9182aa073a8d68e6c537a23.
A4b2PR27 featureCI45955883109 and PR8CI45958456569 pass before parent GO.
Independent precheck and parent PRD/design/spec accept four insight SELECTs,
truthful nullable read IDs, joined revisit ID proof and bounded Dashboard keys.
Preserve raw queries/URL actions/AI privacy; anonymous timeline identity remains
positional. Recompute/schema/migration030/shared calendar stay separate.

DB and consumer Trellis implementers have disjoint ownership; parent coordinates
within total concurrency3, reviews/gates/Git and leaves original D62dirty intact.

## Status

- DB implementation: frozen; 131 differential cases pass in each of UTC,
  Shanghai, New York and Apia; associated UTC five files/353 tests, both
  typechecks and six-file lint/format pass. Four native groups pass below.
- Consumer implementation: frozen; both typechecks, six-file lint/format and
  seven focused files/56 tests pass. New schema21/component6/AI2 cases cover
  nullable outputs, row identity, URL actions and unchanged privacy/counts.
- Consumer regression proof: ignored transform-only old problem keys fail two
  identity tests; old timeline key fails one duplicate-key test. Six source
  hashes remain unchanged; no temporary production rewrite.
- Independent full-slice review finds no production/boundary issue. Reviewer
  types/lint/format, UTC12files409 and New York131 pass; original four SQL/ordered
  argument expressions and unchanged protected-source AST/bytes verified.
- Parent captured815 product/config/test hashes. First test:db passes39files985
  but native reports51/52: the new LIMIT test expected outcome.value while the
  reused submissionReadOutcome helper returns outcome.rows. Independent reviewer
  identified the first successful-query assertion mismatch before any limit-edge
  diagnosis. The corrected run exposes a second test expectation: Math.min(-0,55)
  yields -0 while empty Array.length is +0, distinguished by Node strict equality.
  Both test-only corrections preserve the real LIMIT -0 binding and its trace.
  Original failure evidence: tmp/drizzle-a4c-db.log and db-final.log, each with
  exit1. New authoritative standalone native run returns exit0/52groups in
  tmp/drizzle-a4c-native-verified.log/.exit. Source815 recaptured; complete DB
  rerun returns exit0/39files985/native52 (tmp/drizzle-a4c-db-verified.log/.exit).
- Full test:all returns exit0:223files2728 tests,52 native groups,16 Electron UI
  cases including both daily trend sizes; both types/lint/architecture/security/
  docs/packaging/performance and startup/OJ/userscript smoke pass. Existing native
  migration/recovery/import gates also pass. Log tmp/drizzle-a4c-all.log/.exit.
- Coverage statements76.72/branches70.58/functions74.07/lines79.94 percent;
  duplication1.76 percent. build:check returns exit0, including packaged-main
  external-native guard. All815 source hashes remain unchanged through the final
  gates; original D62dirty/HEAD and schema/030/shared time remain unchanged.
  Logs tmp/drizzle-a4c-build.log/.exit and drizzle-a4c-gate-source.json.
- Normal hooks/push/feature CI/squash/integration CI: complete below.

A4b2 prepush Tooltip incident remains documented without a proven root cause;
if it recurs, preserve trusted input/geometry/simultaneous Tooltip evidence before
changing code or rerunning. No release or whole-phase completion claimed.

## Commit And Remote Integration

Work54f0c25d71ed7a60c5f6a7d1c97d442e693c29f4 passes normal pre-commit and
immediate pre-push/test:ci2728/UI16 without retries or source changes. PR28
featureCI45978229533 passes; squashaacbff0c2c1afe9df4fa2bda5698450f0d76e608
merges into refactor/drizzle with the identical tested tree. PR8 integration
CI45979282462 passes on that squash. PR8 remains draft/base dev; dev/master/tag
unchanged. Branch codex/drizzle-stats-recompute starts from the integrated base.
No installer/release or whole-phase completion follows from this slice.

## Native Test Retrospective

1. Root cause: reused outcome shape was assumed rather than checked; signed-zero
   input semantics were incorrectly reused as an Array.length expectation.
2. First correction exposed the second independent assertion defect. Neither
   failure established a production/native LIMIT regression; both occur in the
   expectation path of the new native test.
3. Prevention: keep query/limit/outcome diagnostics, exact native error and -0
   binding assertions; normalize only expected zero length. Run native tests,
   since repositories.test.ts is intentionally excluded from Vitest.
4. Reviewed other new native groups for the same outcome assumptions. No global
   test helper rewrite or assertion weakening is needed for this bounded fix.
5. Knowledge captured in drizzle-insight-lists.md section6 and the independent
   implementation review. Preserved failed logs precede successful evidence.
