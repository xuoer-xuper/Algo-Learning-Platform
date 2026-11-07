# Committed Data Refresh

## 1. Scope / Trigger

Use this contract when changing a persisted fact read by the renderer, adding a
query hook, or introducing a transaction around repositories that emit changes.
All code paths below are relative to `algo-electron/`.

## 2. Signatures

```ts
type DataTable =
  | 'problems' | 'submissions' | 'notes' | 'stats'
  | 'sites' | 'scripts' | 'credentials' | 'coach'
type DataChangedPayload = { tables: DataTable[] }

emitDataChanged(tables: readonly DataTable[]): void
subscribeDataChanges(listener: (payload: DataChangedPayload) => void): () => void
withDataChangeTransaction<T>(operation: () => T): T
installDataRefreshBridge(target: {
  sendToAll: (channel: IpcChannel, ...args: unknown[]) => void
}): () => void

window.api.data.onChanged(handler: (payload: DataChangedPayload) => void): () => void
```

- Shared schema/type source: `src/shared/types/data.ts`.
- Main-process bus: `electron/shared/dataEvents.ts`; bridge:
  `electron/shared/dataRefreshBridge.ts`.
- Renderer provider: `src/context/DataRefreshContext.tsx`; queries:
  `src/hooks/useIpcQuery.ts`; snapshot/live streams:
  `src/hooks/useIpcSubscription.ts`.

## 3. Contracts

### Writes and transactions

- Topics are logical invalidation domains, not SQL identifiers. Account/rating
  writes invalidate `stats`; visits invalidate `problems` and `stats`.
- Emit only after the statement succeeds, and skip operations that changed no
  rows. Payloads contain topic names only, never records, IDs, credentials, cookie
  values, URLs, or local paths.
- Narrow legacy-compatibility exception during ORM adoption: `upsertProblem` has
  always emitted `problems`/`stats` after a successful existing-row UPDATE even if
  a nullable stored ID makes `WHERE id = ?` with bound null match nothing. Preserve
  that notification and real statement/error execution; do not generalize it to
  new no-op mutations. Outer rollback/COMMIT failure still discards those topics.
- Wrap the synchronous **transaction invocation**, including commit, in
  `withDataChangeTransaction`. Successful nested scopes merge into the parent;
  failed scopes discard their own changes and rethrow. The outermost successful
  commit releases the accumulated notification.
- Never use this scope for an async operation or a nontransactional batch. If an
  autocommit batch partially succeeds, those committed writes must still notify
  readers even if a later statement fails.
- Subscriber or broadcast failure must not turn an already committed database
  write into a reported transaction failure.
- Cookie metadata is deliberately outside this bus: safe-summary reads currently
  rewrite cookie metadata. Emitting `credentials` there creates an infinite
  read/write/refetch cycle. Credential repository mutations still emit normally.

### IPC and lifecycle

- `IPC_CHANNELS.DATA.CHANGED` is `data:changed`. The bridge coalesces topic names
  over a fixed 50ms window so continuous writes cannot starve refresh delivery.
- Broadcast via `WindowManager.sendToAll` to registered shell windows, not remote
  OJ web contents. On shutdown unsubscribe and clear pending timers idempotently.
- Legacy `problems:updated` remains a separate no-payload compatibility event for
  one release. New queries do not subscribe to both events. The sole permitted
  no-consumer API exception is deprecated `problem.onUpdated`; remove the
  exception together with that method when the compatibility release ends.

### Renderer state

- The provider owns the native subscription. Use an allowed `*Api.ts`/hooks
  adapter; context modules do not access `window.api` directly. Isolated component
  tests explicitly provide the context rather than masking missing app wiring.
- `useIpcQuery(fetcher, deps, { tables, enabled })` exposes data, loading,
  refetching, error and refetch. Query identity changes invalidate old requests.
  Disabled/unmounted queries ignore pending results; unrelated topics do not
  refetch. Changes during the first read must not be lost.
- Initial loading and background refresh are distinct. Same-key refresh keeps
  previously successful data, including `null`, empty arrays, zero or false.
  Refetch errors retain that data; automatic reads do not leak rejected promises.
- A successful manual refetch may return its own same-key value even when a newer
  background request supersedes its state update; never return it after identity
  change or unmount. Import flows can depend on that result to open a new item.
- Query identities must include a selected account/handle, not just the account
  list. After syncing account B, a stats event must not switch the view back to
  arbitrary first account A. Preserve editable drafts separately from selection.
- Refreshing a list must not overwrite an unsaved note, credential draft, or Coach
  demonstration state. These are local editing state, not stale server snapshots.
- Retention applies to display data, not an invalidated action preview. A stale
  script-install preview must lose its install actions until revalidation succeeds;
  a swallowed query error is not successful revalidation. Keep source/cancel UI
  visible while remote preview validation is pending.
- App prompt/contest streams use `useIpcSubscription`: subscribe before initial
  read, let any live event win over the pending snapshot, ignore events after
  cleanup, and preserve capture-result identity matching and explicit dismissal.
- A result for a different capture ID is not a prompt update. Do not invoke a
  revision-bumping setter for a no-op result: it would incorrectly suppress a
  valid pending initial snapshot. Explicit dismissal still invalidates that read.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Successful standalone mutation | Publish its logical topics |
| No-op mutation or duplicate insert rejected | No mutation notification |
| Legacy problem upsert with a matching null-ID row | Run the bound-null UPDATE; retain its successful post-statement notification, but none on failure/rollback |
| Outer transaction fails or commit throws | Publish none of that scope's topics |
| Inner rollback caught, outer commit succeeds | Publish only successful outer topics |
| Earlier autocommit succeeds, later batch item fails | Preserve notification for earlier commit |
| Listener throws | Isolate/log notification failure; preserve write result |
| Repeated writes inside 50ms | One deduplicated broadcast |
| Shutdown with queued broadcast | No later broadcast or surviving subscription |
| Same-key refetch pending/fails | Keep loaded content, no initial skeleton |
| Query key changes while old request pending | Ignore old result/error/finally |
| Live event arrives before initial snapshot | Live value remains authoritative |

## 5. Good / Base / Bad Cases

- Good: a background Codeforces sync writes real repositories; the bus refreshes
  Dashboard and ProblemDetail without remounting or clicking refresh.
- Base: an empty query result is loaded data and remains visible during refetch.
- Bad: emitting before commit, wrapping an autocommit batch in a fake transaction
  scope, emitting from cookie summary reads, or replacing live prompt streams
  with generic table invalidation.

## 6. Tests Required

- Unit tests cover nested commit/rollback, failed commit, no-op, listener failure,
  fixed-window coalescing, and idempotent disposal.
- Repository integration tests verify actual write paths, including partial
  autocommit success and rollback of imports/script install operations.
- Query tests cover supersession, disabled/unmount, unrelated tables, refetch
  errors, successful empty values and event delivery during the first read.
- Component tests hold refetch promises pending and assert CredentialsPage and
  CoachMetricsView retain content without loading skeletons. Preserve note and
  prompt race regression suites.
- Verify loading labels against their actual DOM representation: Skeleton places
  its label in hidden text inside `role="status"`, not an `aria-label`. Include a
  positive initial-loading assertion so an always-null selector cannot fake the
  no-skeleton refetch assertion.
- Playwright sync acceptance must use an isolated real database, actual
  SyncService/default writer, the real bridge/preload and rendered readers.
  Deterministic network fixtures belong only in test code. A mock-array update
  is useful renderer coverage, but is not proof of real sync write-through.
- Run full `pnpm test:all` before completion and `pnpm test:ci` before push.

## 7. Wrong vs Correct

```ts
// Wrong: dispatch can happen before commit, including when commit later fails.
db.transaction(() => withDataChangeTransaction(operation))()

// Correct: publish only after the synchronous transaction invocation succeeds.
withDataChangeTransaction(() => db.transaction(operation)())
```
