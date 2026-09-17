# Domain Rules (Non-Negotiable)

> Product and security red lines of Algo Learning Platform. They come from
> `docs/GOVERNANCE/PROJECT_RULES.md`, `docs/GOVERNANCE/SECURITY.md`, `docs/ADR/*.md` and the
> architecture guards in `algo-electron/tests/architecture/check-architecture.mjs`.
> These rules apply regardless of which layout (legacy or template) a file currently lives in.

---

## 1. Browser Container

- The only embedded browser primitive is `WebContentsView`. `BrowserView` must not appear in runtime code
  (ADR: `docs/ADR/ADR_0001_USE_WEBCONTENTSVIEW.md`; guard: `check-architecture.mjs` "BrowserView" rule).
- View lifecycle is owned by the main-process tab manager (`electron/browser/TabManager.ts` today,
  `src/main/services/browser/` after migration). The renderer never creates, positions or destroys views.
- Remote OJ pages load with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` in the
  `persist:oj-main` session (`electron/browser/ojSession.ts`). Never relax these for a site.
- The OJ preload (`electron/browser/ojPreload.ts`) is the only script that runs in OJ pages with bridge
  access. It exposes no generic `ipcRenderer`.

## 2. IPC Trust Boundary

- Every renderer-facing handler goes through the guarded facade in `electron/ipc/trustedSender.ts`
  (`handleFromShell` / `onFromShell`), never through bare `ipcMain`. Guard: `check-architecture.mjs`
  "register*.ts must not import ipcMain".
- Three checks are mandatory and stay mandatory after the zod migration:
  1. sender check (registered webContents, main frame, expected origin),
  2. payload structure check (depth, size, cycles, prototype pollution — `checkIpcPayload`),
  3. per-channel schema (today `payloadSchema.ts` combinators; target `zod` schemas in
     `src/shared/types/`). A handler with parameters and no schema fails the `UNSCHEMAD_IPC_BUDGET`
     guard.
- Window-, tab-, menu- and dialog-affecting handlers resolve the target window from the sender owner
  (`getShellWindowOwner(event)`). Never accept a `windowId` chosen by the renderer.
- Validation failure rejects the invoke; never silently substitute a default.

## 3. Cookies and Credentials

- Cookie values live only in the main process (`electron/cookies/CookieVault.ts`). They never enter
  logs, renderer state, JSON exports, the sync queue, or AI context. The renderer receives only
  `CookieSafeSiteSummary` / `CookieSafeDomainSummary` (name, count, expiry, flags).
- Credentials are encrypted with `safeStorage` (`electron/credentials/credentialVaultCore.ts`).
  `credentials:*` shell channels return masked summaries only. Plaintext travels only on the internal
  `oj-credentials:fill` / `oj-credentials:capture` channels between main and the OJ preload, and
  autofill never submits the form.
- The logger must redact `authorization|cookie|csrf|password|secret|token|api[_-]?key` keys, `Bearer`
  and `Basic` headers, and URL query/hash. This redaction hook is kept when switching to electron-log.
- `tests/security/check-sensitive-files.mjs` must stay green: no `.env`, local database, log file or
  cookie/header plaintext pattern in the tree.

## 4. Renderer Capability Boundary

- The renderer only talks to `window.api` (today `window.electronAPI`). No direct SQLite, filesystem,
  Electron session or Node access. Guard: `check-architecture.mjs` "renderer IPC" rule and
  `countBareControls` / renderer-only-via-`*Api.ts` ratchet (the ratchet is retired once
  `window.api` is typed via `typeof api`).
- Never use `alert`, `confirm`, `prompt`, `window.open` or `localStorage` in the renderer
  (`../frontend/electron-browser-api-restrictions.md`). Confirmation goes through
  `src/components/ui/ConfirmDialog.tsx`.
- Preferences persist in the main process (electron-store), not in the renderer.

## 5. Database

- Schema changes always ship as a migration and update `docs/DESIGN/DATABASE_SCHEMA.md` and
  `docs/OPERATIONS/DATABASE_MIGRATION_ROLLBACK.md`. Released migrations (001–029) are never edited;
  fixes are appended.
- Before any pending migration runs, the database is backed up with the SQLite backup API and a failure
  marker blocks retry until resolved (`electron/backup/sqliteMigrationBackup.ts`,
  `initDbAtPathWithMigrationSafety`). This safety net is kept when moving to Drizzle's `migrate()`.
- AI outputs go to `ai_outputs`; AI code never writes `problems`, `submissions`, `notes`,
  `problem_visits`. Every AI suggestion must be traceable to a problem, submission, visit or stat.
- Repositories/procedures are the only place for SQL. Bare SQL outside the db layer fails the
  `BARE_SQL_BUDGET` guard.

## 6. Submission Monitoring

- Only a final verdict enters `submissions`. Pending, self-test, sample run, public status rows or other
  users' rows are never written (`docs/DESIGN/SUBMISSION_MONITORING_DESIGN.md`).
- Nowcoder and VJudge must not use the generic DOM verdict observer as a real-time source; they use
  their site hooks (`electron/adapters/sites/{nowcoder,vjudge}/hook.ts`). Guard in
  `check-architecture.mjs`.
- The OJ submission bridge token (`oj-submission:getDocumentToken`) proves the envelope came from the
  live document; it is not a defense against forged payloads and must not be treated as one.

## 7. AI Coach

- Rated contest in progress ⇒ Coach is silent. Detection is automatic, on by default, cannot be bypassed
  by settings, and produces an exportable audit record (`electron/coach/ContestGuard.ts`,
  `coach_interventions`). Codeforces rules (2024-09) forbid AI during rated rounds.
- Hints are graded (`electron/coach/hints/HintLadder.ts`); the Coach never outputs a full solution.
- LLM calls are opt-in. The prompt never contains cookies, absolute paths, log content or the user's
  private source unless the user explicitly pasted it (`tests/coach/*` pin this as assertions).
- `coach:saveConfig` / `coach:saveLlmConfig` schemas are allow-lists; the encrypted API key field is
  not writable from the renderer.

## 8. Local-First Data

- Core learning data lives in the local SQLite file. Sync and export are built on top of the local model,
  never the other way round.
- Learning-data JSON export (`electron/backup/learningDataExport.ts`) excludes cookies, `raw_json`,
  logs and absolute paths. Conflicting imports require preview then confirm.
- Backups must include note images, not only the database (open P1 from
  `docs/OPERATIONS/PROJECT_AUDIT_BATCH1_2026_09_11.md`).

## 9. User Scripts (Tampermonkey compatibility)

- Script source is returned only by explicit `scripts:getCode` for a script id, capped at 4 MiB, never
  logged. Lists and remote previews never include source, resource bodies or absolute paths.
- Host permission prompts carry `promptId/scriptName/targetHost/sourceHost` only; no URL path, query,
  headers, body, source or `webContentsId`.
- `scripts:openEditor` opens only `.js` files inside the managed directory.

---

## Verification entry points

```bash
pnpm test:architecture   # red-line guards and ratchets
pnpm test:security       # sensitive file patterns
pnpm test:core           # typecheck + lint + guards + full vitest
pnpm test:all            # + real Electron suites, docs, packaging, performance, Playwright
```

(`npm run …` until phase 0.2 of the alignment plan switches the repository to pnpm.)
