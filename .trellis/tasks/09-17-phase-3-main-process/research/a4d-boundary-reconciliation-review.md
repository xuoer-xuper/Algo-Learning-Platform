# A4d Boundary Reconciliation Review

Date: 2026-11-27. Independent trellis-check, planning only.
Reviewed candidate: algo-electron/tmp/drizzle-a4d-planning-decision-draft.md.
Prior A4d design/review evidence is reused, not rerun or counted as acceptance.

## Verdict

The candidate is a coherent resolution of the planning dependency. No additional
design blocker was found in this focused review. It scopes the exact-path/byte/
execution-branch freeze to A4d/R1 while retaining the final R2/R5 objective. It
does NOT prove or approve the later relocation, approve A4d implementation, or
complete either requirement. Parent acceptance and governing-document sync are
still required before A4d GO; A4c remains independently gated.

## Findings (fixed)

None. Only this review artifact was written.

## Findings (not fixed) / Parent Dependencies

1. Persist the temporal boundary in PRD/design/implement and the applicable
   project spec before implementation. The earlier A4d research says a later
   layout migration must honor the same exception, while the PRD still requires
   electron/ removal and planned legacy relocation. Explicitly supersede only
   the perpetual exact-location reading, not the frozen historical behavior.
   Do not leave an ignored candidate as the sole governing decision.
2. Record the existing recompute notification exceptions in data-refresh.md,
   whose current no-op and partial-autocommit rules otherwise contradict them.
   Preserve the exact matrix below; do not repair the asymmetry in ORM work.
3. Keep a separate R2 entry gate (review/approve the relocation plan) and exit
   gate (prove graph/history/recovery equivalence and final layout). If that
   proof fails, R2 stays incomplete. No old-path forwarding shim, migration
   import rewrite, relaxed source guard, or waived electron/ criterion is
   authorized by this A4d decision.

These are the previously identified governing-contract gaps, not new product
regressions. They are parent-owned design edits, so this reviewer left them alone.

## Checked Contract Details

- A4d/R1 keeps migration030 and recompute-core at their exact paths and bytes,
  including their direct historical dependency branch and unchanged shared time
  behavior. Only the live wrapper switches import to a new runtime helper. The
  historical module is not a forwarding delegate or shared refactoring target.
- Later relocation must preserve the historical algorithm/dependency semantics
  under an explicit path mapping. If imports change, exact byte hashes change;
  later evidence must account for those precise edits, not claim the A4d hash
  freeze survived unchanged. Existing historical fixtures and recovery gates
  remain necessary. This review grants no relocation changes today.
- Runtime INSERT12 equivalence is restricted to the accepted frozen030 physical
  schema/defaults. Baseline deleted_at is nullable with no default, matching
  generated literal NULL; old omitted-column DEFAULT7 versus new NULL is a real
  excluded counterexample. This restriction never applies retroactively to the
  historical030 execution or weakens startup validation. Future schema changes
  need renewed compatibility review; no per-write validation is claimed.
- The late NULL-cache guard belongs at the original per-day failure point after
  all fact conversion, preserving any earlier day's effects. No cache repair,
  eager key validation, public nullable-day API or transaction is introduced.

| Wrapper outcome | Existing behavior to preserve |
| --- | --- |
| Single-day core succeeds, including IGNORE changes0 | Emit stats once |
| Single-day core throws | No wrapper event; native partial effects unchanged |
| Selected sorted unique days, later day fails | Earlier successful calls already emitted individually, subject to caller scopes |
| All-days returns positive attempted-date count, even all IGNORE | Emit stats once after complete success |
| All-days returns0 | No event |
| All-days throws after earlier autocommit writes | Earlier writes can remain with no all-days wrapper event |
| Caller-owned transaction/savepoint rollback or real COMMIT failure | Existing notification scopes discard their queued topics; no new scheduling |

The candidate captures both exceptional behaviors correctly. The fuller matrix
prevents interpreting its shorthand as a change to successful all-days emission
or caller-owned transaction semantics. New mutations still follow the general
refresh rule; these exceptions are preservation-only.

## Verification

- Read current task PRD/design/implement, both prior A4d research documents,
  candidate and relevant adoption/time/refresh contracts.
- Confirmed current wrapper bodies,030 direct import/call, old core column list
  and baseline/schema deleted_at definition agree with the reviewed premises.
- No new SQL experiments, database access, Git operation or product/test/spec
  edits. No moving A4c diff reviewed.
- Lint / TypeCheck / Tests: not run, intentionally not applicable to this
  research-only reconciliation. A4d implementation/native/performance/build and
  historical recovery acceptance remain pending, not inferred from this review.
