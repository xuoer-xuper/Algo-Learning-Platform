# Research: Final outward compatibility and candidate-version review

- Query: Can dev plus release hardening remain a 2.0.1 candidate under the accepted policy, and which outward contracts and acceptance facts must remain visible?
- Scope: Internal read-only source/document review. No tests, builds, application launches, installers, private profiles, credentials or Git commands were run by this researcher. Only this research file is written.
- Date: 2026-11-10 (Asia/Shanghai).
- Candidate baseline: `3702f01ab2d83e73e70c98515cebea829eea19f9`, with uncommitted release-hardening changes; not an accepted master merge or final-asset identity.
- Shipped baseline: `v2.0.0` / `d2d2b0c6b758e1936b00aa602ea172dbb848b065`.

## Findings

### 1. Version assessment

Keeping **2.0.1 as the candidate** is defensible for the observed user-facing scope under the accepted 2026-11-08 policy: favicon correctness, stale reads after writes/sync, timestamp/statistics correctness, configuration preservation, and safe handling/recovery of interrupted upgrades. The maintenance command completes the existing upgrade-recovery obligation; it does not introduce an independent everyday product workflow. Internal libraries, IPC organization, type consolidation and tooling do not independently constitute new desktop features.

This does **not** mean the external JSON contract is unchanged. Learning-data JSON, AI-context JSON and site-config JSON all change their versioned output from 1 to 2, with instant fields changing from text to integer milliseconds. A parser written only for v1 must be updated to consume v2. This must be disclosed as a format-compatibility change, even though it is not by itself an automatic application-major trigger under the accepted separate-format-version policy.

The inspected shipped documents describe versioned export/import formats. No promise was found that every 2.x application will keep emitting v1, that a 2.0.0 importer can read later export versions, that raw SQLite is a stable third-party API, or that arbitrary binary downgrade preserves later data. The accepted design separates JSON-format version from application version and retains v1 inputs. This review therefore found **no new evidence requiring a unilateral version bump or a patch exception**. A package field, passing tests, or absence of a discovered third-party consumer is not itself compatibility proof.

If a supported external integration is identified whose contract specifically requires v1 output from this application line, preserve that supported contract or revisit version/scope. Do not silently redefine such a consumer as unsupported. No such supported integration was identified in this bounded review. The shipped AI exporter expressly mentions external AI tools, so its v2 output deserves the same disclosure as learning-data JSON.

**Release remains paused.** This assessment does not pass final-source, asset, installation, real-site or publication gates. It supplies contract evidence for the final-source acceptance.

### 2. Baseline and scope evidence

The parent supplied read-only `git show v2.0.0:<path>` exports in ignored `algo-electron/tmp/release-contract-baseline/`, preserving repository-relative paths. These files were read directly, rather than inferring shipped behavior from current code. Local exported byte hashes:

| Shipped file | SHA256 |
| --- | --- |
| `algo-electron/electron/backup/types.ts` | `2041c34f4bdf741148c8dbad853e43b52ced93b8417925cc0d5a72eb706aadc9` |
| `algo-electron/electron/backup/learningDataExport.ts` | `69ab845ef43946caffec3641ae89de0c79bb3f2f3efb65c52c4b9f60c78c0372` |
| `algo-electron/electron/ai/contextExporter.ts` | `b0346f33c071fb986d292a0b821e5a467e49a6319316cf8075255644eeb6efbb` |
| `algo-electron/electron/db/repositories/site/importExport.ts` | `6a1845030d6669b30a4e0cd8a4c3227c7c932fc01dc9eb32f821693b794e135b` |
| `docs/DESIGN/DATA_EXPORT_AND_IMPORT.md` | `ffa4a9858e3c27c01abb778aa2f3be49419285acef1632b53ca45b2d3c71865a` |

The parent supplied exact `v2.0.0` versus HEAD scope-log, scope-names and scope-stat files in the same directory. The committed comparison spans 1,091 files, 107,535 inserted and 33,095 deleted lines; much is Trellis/spec/tooling/formatting and shared-type relocation. Commit titles alone do not classify this scope. Runtime additions and phase0/1/2 records identify environment isolation, shared IPC/types, refresh plumbing and timestamp migration/helpers. No additional independent product surface was established.

Uncommitted hardening adds checkpoint/resolution/config protection and release tooling. It requires current-tree verification, not the earlier HEAD result. S1 already independently reviewed preservation of shipped browser/session/credential fixes despite divergent ancestry; see `research/s1-integration-validation.md`. This report does not replace that source review.

### 3. Outward contract matrix

Code paths below are relative to `algo-electron/`. Shipped-source citations refer to the exported v2.0.0 files.

| Surface | Shipped behavior | Candidate contract and evidence |
| --- | --- | --- |
| Installed identity | Established production profile/product | `electron-builder.json5:4` and `:15` retain appId `com.algo.learning` and product `AlgoLearningPlatform`; package name remains `algo-electron`. `electron/app/envSetup.ts:19` adds `-dev` only when unpackaged. Actual NSIS acceptance must prove same profile/registration. |
| Database upgrade | Schema29, migrations001-029 | Frozen030 converts82 instant columns to integer ms. Production requires exact known continuous version/name history and rejects unknown/future/gap/wrong-name/populated-unversioned sources: `electron/db/connection.ts:159`, `src/main/db/legacy-ledger-validation.ts:38`, `tests/db/databaseInitialization.test.ts:124`. Valid history does not guarantee arbitrary manually edited/invalid rows convert; failure must preserve evidence. |
| Historical sources | Actual2.0.0 is schema29 | Existing tests cover fresh and reconstructed21/24/29 paths. Actual2.0.0 installer is this release’s direct upgrade source. `tests/db/fixtures/README.md:5` and archived R5 provenance distinguish reconstructed schemas/synthetic rows from original user databases. Prior35-file equality proves rc.1/2.0.0 migration-helper equivalence only. |
| Learning-data JSON | Shipped `backup/types.ts:1` defines1 and `:9` text exported_at; `learningDataExport.ts:133` rejects non1 | Current `backup/types.ts:1` emits2/numeric instants; `learningDataExport.ts:177` accepts1/2 and rejects future. v1 normalization precedes preview/conflicts/writes, including original exclusion-only metadata at `:240`. Same six tables/privacy/conflict boundaries. Shipped2.0.0 rejects current output. Tests: `tests/integration/learningDataTimestampCompatibility.test.ts:65`, `:80`, `:97`, `tests/db/credentialExport.test.ts:74`. |
| Site-config JSON | Shipped `db/repositories/site/importExport.ts:8` emits1/text exportedAt; `:20` accepts only1 | Current same file `:8` emits2/numeric exportedAt; `:21` accepts1/2 and rejects future, preserving built-in protection. Separate format from learning-data schema_version. Shipped2.0.0 rejects candidate2; no cross-version round-trip promise. |
| AI-context JSON / Markdown | Shipped `ai/contextExporter.ts:1` names external AI tools; `:18` defines1 | Current `:18`, `:72` emits2. Numeric fields: exported_at, wrong-problem last attempt, unreviewed last visit, recent-activity instant. Known persisted snapshots normalize; arbitrary JSON/user strings stay unchanged (`electron/db/legacy-ai-context.ts:13`). Markdown remains readable. External v1-only consumers need a v2-aware parser. |
| Config, files, credentials | Existing config, database facts, local files/envelopes | Canonical/corrupt config preserved; automatic normalization protects original bytes (`electron/app/config.ts:105`, `:270`).030 does not rewrite external note/image/script files. Opaque envelope byte preservation does not prove OS-bound decryption or real login persistence. Installed lifecycle must verify representative content/hash and reading. |
| Recovery / downgrade | Existing backup/failure-marker path; no arbitrary lossless downgrade promise found | Verified checkpoint before writes; interrupted startup blocks; explicit keep-current/retry-source verifies state. Successful-use failures retain new data. Old snapshots exclude later records; replacing only the executable is unsupported. See `src/main/db/resolve-upgrade.ts` and `docs/OPERATIONS/DATABASE_MIGRATION_ROLLBACK.md:132`. Native interruption and installed maintenance evidence are distinct. |
| Shell IPC / userscripts | Private shell bridge and separate userscript runtime | `window.api`/numeric IPC are coordinated with bundled renderer; no stable third-party shell SDK found. Userscript grants/runtime remain a separate extension boundary. Do not market internal preload refactoring as a new plugin API. See `.trellis/spec/project/domain-rules.md:23`, `:103`. |

Historical suffixless local timestamps retain migration-system-local interpretation; known script/credential/runtime families use UTC+8, explicit offset/Z wins. Changing timezone before first upgrade cannot recover provenance absent from old strings. Preserve the documented DST gap/fold and strict-invalid-value policy; do not promise an arbitrary old database is always automatically repairable.

### 4. Truthful release-note scope

After the corresponding final gates pass, describe these as fixes to existing behavior:

- 标签图标正常加载，加载失败时可靠显示兜底图标。Do not promise an unimplemented main-process favicon proxy or universal AcWing network availability.
- 保存、同步或导入后，已打开的统计/题目等页面及时显示更新，后台刷新保留已加载内容与编辑草稿。The change fixes stale reads; do not advertise cloud/live multi-device synchronization.
- 统一时间比较和日统计计算，兼容历史学习数据导入，修复已知旧时间表示导致的统计问题。Do not claim invented recovery of unknown historical timezone provenance.
- 升级前验证数据库恢复点；升级中断或恢复未完成时阻止正常启动，并提供保留现态或验证源状态后重试的受控处理。自动配置归一化先保护原字节。Do not promise automatic arbitrary downgrade, a full-profile snapshot or every-hardware power-loss durability.
- 内部校验、日志和发布工具维护 can be brief maintenance detail, not the headline or a claim that Drizzle/phase3 is finished.

The compatibility paragraph must cover **all three formats**, for example:

> 本版升级会转换本地数据库的时间字段。学习数据 JSON、AI 上下文 JSON 与站点配置导出使用各自的 v2 格式，时间点使用 Unix 毫秒；学习数据和站点配置仍可导入旧 v1 文件。旧版应用或仅支持 v1 的外部工具不能直接消费新的 v2 文件。升级成功使用后优先通过修复版解决问题；受控恢复须保留当前状态，升级前恢复点不包含之后新增的数据。SQLite 与学习数据 JSON 均不是完整用户目录备份。

Do not copy the existing CHANGELOG “未发布” block wholesale. Its note-edit isolation, Coach stale-result/contest protections, import-derived statistics and pet fixes are already present in the shipped2.0.0 baseline according to prior scope/S1 review. Shipped Ctrl-click, home navigation, focus/fullscreen, credential/Hello and session fixes are retained behavior, not new2.0.1 features. The existing source version was advanced in phase0; it is not proof a 2.0.1 release has shipped.

### 5. Evidence reuse and final acceptance facts

| Evidence already recorded | Legitimate reuse | What it does not prove |
| --- | --- | --- |
| 2026-10-31 user-installed2.0.1 favicon acceptance, archived favicon PRD:34-37 and journal1:182/192 | Prior fix worked for observed seven-site icons and reliable fallback; retain its provenance when verifying unchanged implementation | Not current candidate installation, authenticated sessions, formal submissions, synchronization or full seven-site workflow. Journal retains AcWing app:// Referer nuance; do not strengthen this into an unconditional CDN promise. |
| Archived R4 verification, 2026-11-04 | Real SyncService/default writer/IPC/React path and shared two-second refresh assertion | Response data is a test-controlled Codeforces fixture with external network forbidden, not the current real Codeforces service/account. |
| Archived R5, 2026-11-05 | Fixed historical schemas; prior actual24/29 copies, integrity/FK/time/aggregate preservation; original DB/WAL hashes unchanged | Not exact immutable release-era user databases, not all nullable columns populated, not final hardening source/installer. Do not request a nonexistent1.0.0 private DB again. |
| S1 current-worktree baseline test:all | Resolved integration tree preserves shipped fixes and baseline suites passed | Predates hardening; no final installer/manual/real-site acceptance. |
| Focused hardening checks / native interruption matrix reported by parent | Relevant synthetic/native boundaries, once parent ties results to current files | Does not replace actual NSIS lifecycle or real authenticated seven-site use. This researcher did not execute or independently certify those runs. |

Keep the manual gates in `docs/OPERATIONS/RELEASE_PROCESS.md:111` onward. The report for the final accepted source/assets must establish these facts, with date, source SHA, installer hash, environment and evidence classification:

1. Actual installed app starts on a fresh isolated Windows account; expected product/icon/start-menu/uninstall registration and production profile are correct. From actual2.0.0 upgrade, synthetic problem/submission facts, note text and external image bytes, config, managed script bytes/resources and opaque envelopes survive. Repeat launch retains post-upgrade rows. Current Sandbox engineering evidence must state if its source was dirty and cannot be mislabeled accepted-master evidence.
2. Installed interrupted-state path blocks normal use; supported explicit resolution retains current data, closes cleanly and permits correct normal restart. Native forced-termination matrix remains separate evidence. Uninstall retains data and reinstall reads it.
3. Core pages in the final package: home, tabs/sidebar, settings/statistics, problem details and note overlay, script management, backup/import/export have no blocking error; text/image reading and relevant controls work. A process/window-open marker is not visual or interaction acceptance. Automated UI tests may cover specific cases if the report says which; they do not certify every installed page.
4. Seven sites remain explicit: Codeforces, AcWing, Nowcoder, VJudge, PTA, Luogu and LeetCode CN. User-controlled real login/normal authorized submission, final verdict associated with the correct own submission, exactly one persistent result, and no pending/self-test/public/other-user rows. Do not obtain passwords, bypass CAPTCHA/risk controls, make competition submissions or claim synthetic hooks are live-site evidence.
5. Real Codeforces API sync/current-page sync update expected data without duplicate facts, and current pages refresh. An existing suitably sourced recent report may be reused only with a concrete unchanged-path explanation covering the final package; the retrieved favicon report is insufficient.
6. If the release claims login/credential continuity, verify it through user-controlled installed use. Opaque envelope equality proves byte preservation, not decryptability, cookie-key continuity or successful authenticated sessions. Never put reusable session data or plaintext in reports/assets.
7. Complete final local gates, required CI, independent final-tree review and source/version/tag/asset correspondence before renewed public-release authorization. No credentials are needed to complete research or synthetic/native checks.

No sufficiently scoped final-package seven-site login/submission/sync report was found. This is an acceptance-evidence gap, not a request to use real accounts autonomously.

### 6. Actionable wording gaps sent to owners

At review time the following current-facing contradictions were found and reported; the owners are updating them concurrently. This research records discovery, not a claim that their fixes/tests are complete:

- `algo-electron/src/features/settings/BackupPanel.tsx:114` still claimed “完整备份请用数据库备份”, although metadata and recovery docs were corrected. `docs/DESIGN/DATA_EXPORT_AND_IMPORT.md:35` repeated it; `docs/GOVERNANCE/SECURITY.md:60` implied complete local restoration from the DB. Final checker owns bounded UI/docs correction. Historical audit findings should remain historical.
- `docs/GOVERNANCE/COMMIT_RULES.md:136-144` still described release-it auto commit/upload, `--no-verify`, and major=data format/unrollbackable migration. Parent owns current-section sync to accepted policy and guarded tooling.
- `VERSION_PLAN.md` was still linked as a current guide while describing an old RC, npm version and direct release upload; parent owns an explicit historical banner pointing to the actual current release procedure. Preserve history rather than rewrite old actions as new facts.

These are R1/R3/S4 consistency fixes, not reasons to introduce another safety waiver or change the package version. Recheck the final wording before signing the compatibility gate.

## Files Found / Related Specs

- `research/standards-and-policy.md`: accepted SemVer/recovery direction and external-source provenance; supersedes old patch-exception proposal in `release-201-scope.md`.
- `.trellis/spec/project/git-workflow.md:193`: user/integration compatibility determines increments; no automatic major for internal schema/downgrade limits.
- `.trellis/spec/project/unix-millisecond-time.md`:82-column conversion, v1 input normalization, timezone and strict failure rules.
- `.trellis/spec/project/historical-database-fixtures.md`: reconstructed/private/installer evidence distinctions.
- `.trellis/spec/project/domain-rules.md`: privacy, official submissions, IPC and existing userscript boundaries. Its inherited “backups include images” aspiration must be read with the accepted task’s actual narrow protection scope; no full-profile feature is introduced here.
- `.trellis/spec/project/upgrade-recovery.md`, `config-normalization-protection.md`, `release-evidence.md`: current narrow runtime/tooling contracts, not acceptance proof.
- `docs/OPERATIONS/RELEASE_PROCESS.md`: final source/assets and eight acceptance gates.
- `docs/DESIGN/DATA_EXPORT_AND_IMPORT.md`: current learning-data/AI output contracts and privacy scope.
- `algo-electron/electron/{backup/types.ts,backup/learningDataExport.ts,ai/contextExporter.ts,db/repositories/site/importExport.ts}`: concrete format producer/readers.
- `.trellis/tasks/archive/2026-11/09-17-phase-2-ipc-contract/{r4-verification-2026-11-04.md,r5-verification-2026-11-05.md}` and archived favicon task: bounded earlier verification.

## External References

No new external retrieval was performed. This review uses the previously retrieved [Semantic Versioning2.0.0](https://semver.org/) clauses1/6/7/8 and accepted policy record; that standard requires identifying the declared public API. It does not automatically version internal storage or promise that old software reads future formats. Microsoft/AWS/PostgreSQL/SQLite analogies remain in `standards-and-policy.md`; they do not establish this product’s compatibility or acceptance.

## Caveats / Not Found

- This is a bounded contract review, not a line-by-line audit of all1,091 changed files or proof of no possible third-party dependency. Prior S1/phase reviews and current independent code check remain necessary.
- The supplied baseline exports came from the parent’s read-only Git commands; this role did not run Git. Hashes above identify local reviewed bytes, not final asset hashes.
- Source is still being edited by other owners. Final accepted SHA must revalidate all assertions and wording; this report must not be inserted unchanged as a passed final-master gate.
- No final public-API commitment requiring permanent v1 output, arbitrary same-major storage downgrade, current final-artifact installer result, real credential continuity, or complete seven-site acceptance was found in this review. Unknown evidence is not a pass or an automatic version-major requirement.
- No version, CHANGELOG, code, spec, user profile, Git state or release state was changed by this researcher.

