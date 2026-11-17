# 发布加固最终代码复核

2026-11-10，分支 `fix/release-upgrade-safety`，基于 `3702f01` 的未提交集成树。
使用实际 release worktree；未读取或修改真实用户 profile，未执行 Git 提交、推送、tag 或发行。
原生/UI/构建/安装验收由主会话串行执行；Sandbox harness 由其独立 owner 复核。

## 范围与复核结论

按 release task 的 check.jsonl、prd/design/implement 和 shared/backend/project 规范复核
DB 生命周期、备份/恢复/检查点、配置保护、维护启动、发布工具及架构/打包门的衔接。
旧 phase3 注入上下文与当前任务不符，已按 dispatch 指定的 release task 手动加载。
001–030 和固定历史 fixture 无 diff；不包含 Drizzle。

- 正常启动必须同时通过 unresolved checkpoint、failure marker 和已解决审计检查。
  `upgrade-resolution-audit.ts` 验证同一 attempt/database/backup/pending 关联；
  `assertMigrationRetryAllowed` 重验 resolution 的保护副本与 hash。缺失、损坏、prepared
  审计或损坏快照保持阻断，不能仅修改 state 字符串绕过。
- 旧 marker 原字节 hash 与 UUIDv5 关联审计保留。启动在 marker 已归档、下一 checkpoint
  尚未替换处中断时，通过精确 attempt-linked 归档 marker 重新验证；既有回归通过。
- 生产入口先取得单实例锁，维护入口不启动正常配置/服务/窗口；normal 初始化只在
  整个 DB 边界成功后暴露全局连接。后续普通服务失败不触发旧快照恢复。
- 发布准备允许的变更限定 package/CHANGELOG，含 staged/untracked；真实 installed
  release-it lifecycle 测试与精确资产/CI/审计门共同覆盖，不将 mock 当作真实上传证据。
- 父会话同步的 COMMIT_RULES、upgrade-recovery、migration-status 与两阶段发行/正常
  hooks/有限恢复一致；没有继续有效的 hook 绕过约定。

## 已修复问题

1. `tests/app/themePreference.test.ts`：自动归一化已改用保护后 rename，旧测试仍计数
   electron-store setter，且 canonical 配置的零 setter 不再证明未改文件。移除旧 mock，
   断言完整规范化结果、byte-identical 原配置备份、第二次加载不再产生备份或回写。
   Node22 定向 coverage 红测稳定复现原断言失败。
2. `tests/coach/coachMouseEventDedupe.test.ts`：完整 coverage 门在真实 lazy 聊天面板仍
   suspended 时等待按钮超时。点击后在 act 内等待 `vi.dynamicImportSettled()`，再验证
   可见关闭按钮和所有 capture 边界；teardown 也先结清动态导入。未 mock 面板、增加
   重试或放宽超时。Node22 定向测试可通过原版，但实际冷加载耗时2.5秒，符合 import
   边界随负载变化的证据；最终完整并行 coverage 仍由父会话验证。
3. `BackupPanel.tsx`、`DATA_EXPORT_AND_IMPORT.md`、`SECURITY.md` 仍将数据库备份称为
   完整备份。同步为 JSON/SQLite 都不是完整用户目录备份；图片、配置、脚本、session
   分别保护。`learningDataExport.ts` 提示进一步明确 SQLite 包含库内笔记正文，避免
   暗示全部正文均在库外。历史审计记录保持原貌。
4. `resolve-upgrade.ts` 的旧 marker 关联要求 pending 延伸到当前030，真实已发布
   2.0.0 的 marker 却最多到029。新增从冻结001–028真实创建源库、仅029为 pending
   的 keep-current/retry-source 两条回归：修改前均在 inspectRecovery 失败。经主会话
   确认，历史 target 改为 source+原pending，严格验证为当前已知非空连续扩展前缀；
   重建只运行 source.length..target.length。历史 target 不执行新版 orphan 清理，
   防止把 Unix-ms 写入旧 TEXT 时间列；下次正常启动再创建新的保护尝试并迁移到030。
   空 pending、缺口、错名、未来迁移继续拒绝。格式1 checkpoint 同样允许已知历史
   target 前缀，不降低 source/schema/FK/integrity/audit 验证。
5. 新真实历史测试复现 Windows SQLite CANTOPEN：双UUID重建目录让
   `candidate.sqlite-journal` 在本工作区达到260字符，ALTER TABLE029无法建 journal。
   临时目录保留一个独占 randomUUID，去掉重复 attemptUUID，缩短37字符；同一 backup
   父目录、链接拒绝和成功后清理边界不变。两次红测稳定；缩短后真实回归通过。
6. 父会话 Node22 全量门（`tmp/release-safety-all-final-node22.log`）新增1个失败：
   `noteTabIsolation` 首次打开笔记仍停在编辑器 skeleton，1721个其他用例通过。
   该测试需要先经过 ShellRouter 的 lazy 页面，再经过异步 loadNote 和第二层
   MilkdownEditor lazy；Crepe mock 还 importActual 整套依赖。原15秒 DOM轮询仍把
   导入耗时当成界面就绪等待。`openNote` 现在在 act 内依次结清页面导入、点击/读取、
   编辑器动态导入，再断言正文与保存；teardown 结清导入。没有延长15秒、替换生产
   编辑器或删减隔离/旧读竞态/卸载flush断言。同文件两处非空断言顺手改为显式检查。

## 验证

所有本次 scoped 测试与质量检查使用进程 PATH 指向实际 Node22.23.2；未修改全局设置。

| 命令/范围 | 结果 | 本地日志 |
| --- | --- | --- |
| theme + coach 定向 coverage，修复前 | theme 1失败，coach8通过 | `tmp/review-final-reproduced.log` |
| theme/coach/config/lazy routes/export 8文件 coverage | 77通过 | `tmp/review-final-fixes.log` |
| `pnpm run lint` | 通过 | `tmp/review-final-lint.log` |
| `pnpm run typecheck`、`pnpm run typecheck:tests` | 通过 | `tmp/review-final-typecheck*.log` |
| 真实旧marker定向，修复前 | 2失败、非法pending4通过 | `tmp/review-legacy-target-red.log` |
| 历史target第一轮修复 | 58通过、Windows长路径1失败 | `tmp/review-legacy-target-green.log`（文件名不代表结果） |
| Windows长路径单例复现 | CANTOPEN失败 | `tmp/review-legacy-path-red.log` |
| resolver/initialization/checkpoint/startup 4文件，全部修复后 | 59通过 | `tmp/review-legacy-target-final.log` |
| noteTabIsolation/milkdownLatex/transitions/coach 4文件 coverage | 27通过 | `tmp/review-lazy-note-final.log` |
| 最后历史target/短路径/note测试改动 scoped lint + 全量 source/tests tsc | 全部通过 | `tmp/review-final-last-{lint,typecheck,typecheck-tests}.log` |
| `git diff --check`、冻结migration/fixture diff | 通过；冻结文件无变更 | 静态检查 |

定向 coverage 命令仅通过 CLI 将全仓覆盖率阈值暂设0，以验证选定测试；配置文件和
最终完整门的阈值未变。父会话在 frozen install 后的完整门必须重验最新版。

## 未修复问题与验收限制

既有 ViewTransition `flushSync` lifecycle 警告在 transitions/noteTabIsolation 定向
测试仍可观察；它来自原有生产过渡实现，本轮没有隐藏日志或扩大修改范围，后续需
在对应 renderer 任务处理。没有未处理的 Promise rejection。

本轮范围内未留下已知需代码修复的问题。最终全量自动门、构建、真实 NSIS隔离
安装/升级/卸载/重装、人工七站/同步/核心页面、对外版本分类和PR CI尚需父会话记录。
本报告不声称公开发行就绪；公开发布仍暂停。开发工作区快照不能代替接受master SHA
的最终资产证据。当前代码/测试已稳定，后续不再编辑，由父会话进行最终验证。
