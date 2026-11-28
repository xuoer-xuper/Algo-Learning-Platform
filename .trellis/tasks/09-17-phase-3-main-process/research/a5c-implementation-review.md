# A5c DELETE Implementation Review

- Date: 2026-11-28 (Asia/Shanghai).
- Workspace: C:/Users/drxuo/.codex/worktrees/release-2-0-1/Algo-Learning-Platform.
- Branch: codex/drizzle-notes-delete; base: 26be448.
- Reviewed current C-worktree PRD/design/implement/check context and
  `.trellis/spec/project/drizzle-notes-delete.md`, including the explicitly
  approved one-line observer exception. Research alone was not implementation GO.
- Verdict: one mechanical integration-test observer issue fixed with parent
  approval; no remaining actionable correctness finding. Product/test edits
  are frozen for parent final DB/full/build and CI gates.

## Finding fixed by this reviewer

`algo-electron/tests/db/notes-file-path-reads.test.ts:219` recognized DELETE only
when its predicate started with unqualified `id`. The new public builder emits
qualified `notes.id`. The observer consequently skipped DELETE traces and error
injection: the first independent UTC run reported six A5a failures, although new
A5c, A5b and caller tests passed (303 pass / 6 fail across eight files).

After obtaining explicit approval to touch this protected test file, changed only:

```ts
if (/^delete from notes where (?:notes\.)?id\b/.test(normalized)) return 'delete'
```

This restores observation of both legitimate native SQL forms; it does not relax
the expected behavior, remove trace assertions, skip injections, or alter any
test body. The content classifier and A5a/B oracle bytes remain unchanged.
Verified positive unqualified/notes-qualified IDs and negative other-table,
other-qualified-column and id_other forms. Full-file reconstruction proves this
is the sole A5a test change.

Parent retains all 60 original protected hashes in
`tmp/drizzle-a5c-protected-source.json` and records an explicit approvedExactEdits
entry, rather than silently replacing a baseline hash. Independent verification
confirms 59 current files exactly unchanged plus this one authorized replacement;
every original snapshot hash still matches base26be448.

## Earlier owner correction reviewed

Core writer initially obtained 47/48 focused passes: the lifecycle test included
three migration Date.now calls after reinitialization in its no-DELETE-clock
assertion. Inspected original failure output and the correction: assert no clock
calls before init, clear only immediately after initDbAtPath, then require no
clock calls for subsequent deletes via the unchanged final assertion. This
isolates setup activity without masking deletion clock reads or changing product
behavior. Owner final48 and reviewer complete309 pass. This was not a reviewer edit.

## Independent implementation and scope review

- Exact reconstruction proves NoteService changes only one import and the final
  DELETE initializer. Existing path lookup, missing stop, file cleanup, two
  changes reads/event placement, all other methods and five remaining native
  statements are unchanged. Content's exact binding-order contract is untouched.
- `notes/delete.ts` wraps only the supplied handle, uses public delete/where with
  one raw named equality placeholder, prepares/runs once and returns the native
  RunResult unchanged. It adds no lifecycle/cache/clock/event/FS/SELECT/transaction/
  catch/validation, no RETURNING/filter/LIMIT, and no undefined-key omission.
- Tiny DELETE oracle preserves the base SQL and bound argument with no production
  runtime import. Service/batch comparisons reuse the unchanged independent A5a
  oracle instead of copying or parameterizing it with production implementation.
- Tests distinguish helper no-match execution from service lookup short-circuit;
  cover literal/empty/NULL/native-container inputs, native result identity and
  bigint rowid, changes/event/changes, files-first errors, trigger effects,
  query_only/readonly, injected stages, lifecycle, real NULL-list partial batches,
  caller savepoints/actual COMMIT failure and synchronous guarded listeners.
- Frozen030 scope and damaged-DDL class/code/stage/identity qualification are
  retained. No quoted-message exactness promise, native error translation,
  new request type, storage repair, or file restoration on SQL rollback is added.
- All 180 previous native top-level statements remain an ordered identical AST
  subsequence. All 50 previous app top-level statements outside runTests and all
  37 previous runTests statements also remain unchanged/in order. Native imports
  add only query helper/oracle; app isolation, deferred imports and teardown stay.
- Four added native groups and two app groups supplement unchanged coverage. App
  additions verify FAIL audit/row retention after actual file removal and stateful
  native-result reads around the event; previous NULL/batch/cleanup/rollback cases
  are reused. No unsafe new filesystem paths or live-root deletion is introduced.
- Shared verify.mjs adds exactly one DB-list entry; architecture changes exactly
  budget6-to5. Vitest configuration is protected/unchanged. Scope/spec/README
  updates describe deletion without implying content or whole-phase completion.

## Verification performed by this reviewer

Node22.23.2; log paths below are relative to `algo-electron/`.

- `tmp/drizzle-a5c-review-ast.log`: exact service/oracle/runner/budget scope,
  prior native/app AST preservation and initially all60 unchanged hashes.
- `tmp/drizzle-a5c-review-protected-fixed.log`: after approved fix, 59 exact
  current hashes plus one exact reconstructed observer edit; all60 original base
  hashes retained and matched; classifier boundary checks passed.
- Initial `tmp/drizzle-a5c-review-static.exit`: production/test TypeCheck,
  scoped ESLint and Prettier all0. Initial
  `tmp/drizzle-a5c-review-focused-utc.log/.exit`: 303 pass / 6 fail, exit1,
  with the observer failures above preserved as diagnostic evidence.
- Final `tmp/drizzle-a5c-review-static-fixed.exit` and matching fixed logs:
  production TypeCheck0, tests TypeCheck0, scoped ESLint0, Prettier0. Scope
  includes helper/service/oracle/focused/A5a observer/native/app and both shared
  runner/ratchet files; zero warnings and unused-disable reporting remain enabled.
- `tmp/drizzle-a5c-review-focused-utc-fixed.log/.exit`: eight files / 309 tests,
  exit0. Includes new48, A5a63, A5b97 and101 caller cases in dataChangeNotifications,
  ipcSchemas, timestampSchemas, noteTabIsolation and dataRefreshSurfaces.
- `git diff --check` passes; existing CRLF normalization notices only.

## Parent native evidence and remaining gates

Read parent's `tmp/drizzle-a5c-initial-native.log/.exit` and
`tmp/drizzle-a5c-initial-app.log/.exit`: actual Electron repositories75/75 and
real-app34/34, both exit0, including prior71/32 plus added4/2. This is parent
execution evidence, not a reviewer native rerun or a substitute-driver probe.
Those initial runs precede the observer-only fix; native/app source did not
change. Parent still reruns DB/native/app and full/build on its final frozen
snapshot before normal hooks, feature CI and integration acceptance.

## Findings not fixed / boundaries

No remaining actionable finding in this slice. No native/global/build/install/
rebuild or Git mutation was performed by this reviewer. Content's SET-order/CTE
decision, create/full-row reads, nullable outputs, false-result UI handling and
dual-store/backup/path risks remain separate. Older A4b2 Tooltip diagnostics stay
unresolved; green tests do not establish a fix. No release, installer or phase
archival is implied by this review.
