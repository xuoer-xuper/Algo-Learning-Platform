# 文档索引

本文是 Algo Learning Platform v1.0 成品文档入口。当前文档只保留项目介绍、协作规则、架构契约、数据结构、发布运维和长期架构决策；路线图、协作期任务清单和未规划增量不进入当前文档集。

## 项目与版本

| 文档 | 作用 |
|---|---|
| [项目 README](../README.md) | 项目介绍、功能、技术栈、运行方式和文档入口。 |
| [CHANGELOG](PRODUCT/CHANGELOG.md) | 已发布版本的用户可见变化。 |
| [LICENSE](../LICENSE) | MIT License。 |

## 协作与治理

| 文档 | 作用 |
|---|---|
| [PROJECT_RULES](GOVERNANCE/PROJECT_RULES.md) | v1.0 稳定技术边界、本地优先原则和模块红线。 |
| [CONTRIBUTING](GOVERNANCE/CONTRIBUTING.md) | 本地开发、修改边界、PR 检查和 issue 要求。 |
| [COMMIT_RULES](GOVERNANCE/COMMIT_RULES.md) | Git 提交信息格式和提交粒度约定。 |
| [SECURITY](GOVERNANCE/SECURITY.md) | Cookie、用户数据、导出、日志和安全报告边界。 |

## 设计契约

| 文档 | 作用 |
|---|---|
| [SYSTEM_ARCHITECTURE](DESIGN/SYSTEM_ARCHITECTURE.md) | Main、Preload、Renderer、IPC、浏览器容器、数据流和核心模块边界。 |
| [DATABASE_SCHEMA](DESIGN/DATABASE_SCHEMA.md) | SQLite schema、migration、索引、repository 和写入约束。 |
| [SITE_ADAPTER_GUIDE](DESIGN/SITE_ADAPTER_GUIDE.md) | 站点适配、提交抓取、parser、实时 hook 和自定义站点规范。 |
| [SUBMISSION_MONITORING_DESIGN](DESIGN/SUBMISSION_MONITORING_DESIGN.md) | 七站提交监测数据流、submit intent、站点差异和 fail-closed 边界。 |
| [DATA_EXPORT_AND_IMPORT](DESIGN/DATA_EXPORT_AND_IMPORT.md) | SQLite 备份、学习数据 JSON 导出导入、导入预览和冲突策略。 |

## 发布与运维

| 文档 | 作用 |
|---|---|
| [RELEASE_PROCESS](OPERATIONS/RELEASE_PROCESS.md) | Windows 发布前版本、验证、打包、产物检查和人工验收流程。 |
| [TROUBLESHOOTING](OPERATIONS/TROUBLESHOOTING.md) | 登录、页面加载、提交监测、同步、数据库、笔记、脚本、统计和打包排障。 |
| [DATABASE_MIGRATION_ROLLBACK](OPERATIONS/DATABASE_MIGRATION_ROLLBACK.md) | SQLite migration 失败识别、备份、恢复、修复和禁止事项。 |

## ADR

| ADR | 决策 |
|---|---|
| [ADR README](ADR/README.md) | ADR 目录职责、新增规则和维护要求。 |
| [ADR_0001_USE_WEBCONTENTSVIEW](ADR/ADR_0001_USE_WEBCONTENTSVIEW.md) | 统一使用 `WebContentsView`。 |
| [ADR_0002_COOKIE_VAULT](ADR/ADR_0002_COOKIE_VAULT.md) | CookieVault 和 Cookie 安全边界。 |
| [ADR_0003_EVENT_LOG_AND_ANALYTICS](ADR/ADR_0003_EVENT_LOG_AND_ANALYTICS.md) | 学习行为采用“原始事件日志 + 聚合统计表”。 |

## 应用模块 README

| 区域 | 文档 |
|---|---|
| Electron app | [algo-electron/README](../algo-electron/README.md) |
| electron | [electron/README](../algo-electron/electron/README.md) |
| adapters | [electron/adapters/README](../algo-electron/electron/adapters/README.md) |
| adapter shared | [electron/adapters/shared/README](../algo-electron/electron/adapters/shared/README.md) |
| adapter sites | [electron/adapters/sites/README](../algo-electron/electron/adapters/sites/README.md) |
| Codeforces adapter | [electron/adapters/sites/codeforces/README](../algo-electron/electron/adapters/sites/codeforces/README.md) |
| AcWing adapter | [electron/adapters/sites/acwing/README](../algo-electron/electron/adapters/sites/acwing/README.md) |
| Nowcoder adapter | [electron/adapters/sites/nowcoder/README](../algo-electron/electron/adapters/sites/nowcoder/README.md) |
| VJudge adapter | [electron/adapters/sites/vjudge/README](../algo-electron/electron/adapters/sites/vjudge/README.md) |
| PTA adapter | [electron/adapters/sites/pta/README](../algo-electron/electron/adapters/sites/pta/README.md) |
| Luogu adapter | [electron/adapters/sites/luogu/README](../algo-electron/electron/adapters/sites/luogu/README.md) |
| LeetCode adapter | [electron/adapters/sites/leetcode/README](../algo-electron/electron/adapters/sites/leetcode/README.md) |
| ai | [electron/ai/README](../algo-electron/electron/ai/README.md) |
| ai recommendations | [electron/ai/recommendations/README](../algo-electron/electron/ai/recommendations/README.md) |
| ai summary | [electron/ai/summary/README](../algo-electron/electron/ai/summary/README.md) |
| app | [electron/app/README](../algo-electron/electron/app/README.md) |
| backup | [electron/backup/README](../algo-electron/electron/backup/README.md) |
| browser | [electron/browser/README](../algo-electron/electron/browser/README.md) |
| cookies | [electron/cookies/README](../algo-electron/electron/cookies/README.md) |
| db | [electron/db/README](../algo-electron/electron/db/README.md) |
| db migrations | [electron/db/migrations/README](../algo-electron/electron/db/migrations/README.md) |
| db repositories | [electron/db/repositories/README](../algo-electron/electron/db/repositories/README.md) |
| db ai context snapshots | [electron/db/repositories/aiContextSnapshot/README](../algo-electron/electron/db/repositories/aiContextSnapshot/README.md) |
| db ai output | [electron/db/repositories/aiOutput/README](../algo-electron/electron/db/repositories/aiOutput/README.md) |
| db account | [electron/db/repositories/account/README](../algo-electron/electron/db/repositories/account/README.md) |
| db cookie record | [electron/db/repositories/cookieRecord/README](../algo-electron/electron/db/repositories/cookieRecord/README.md) |
| db problem | [electron/db/repositories/problem/README](../algo-electron/electron/db/repositories/problem/README.md) |
| db submission | [electron/db/repositories/submission/README](../algo-electron/electron/db/repositories/submission/README.md) |
| db site | [electron/db/repositories/site/README](../algo-electron/electron/db/repositories/site/README.md) |
| db stats | [electron/db/repositories/stats/README](../algo-electron/electron/db/repositories/stats/README.md) |
| db user script | [electron/db/repositories/userScript/README](../algo-electron/electron/db/repositories/userScript/README.md) |
| ipc | [electron/ipc/README](../algo-electron/electron/ipc/README.md) |
| notes | [electron/notes/README](../algo-electron/electron/notes/README.md) |
| parsers | [electron/parsers/README](../algo-electron/electron/parsers/README.md) |
| parser sites | [electron/parsers/sites/README](../algo-electron/electron/parsers/sites/README.md) |
| rating | [electron/rating/README](../algo-electron/electron/rating/README.md) |
| scripts | [electron/scripts/README](../algo-electron/electron/scripts/README.md) |
| shared | [electron/shared/README](../algo-electron/electron/shared/README.md) |
| sites | [electron/sites/README](../algo-electron/electron/sites/README.md) |
| builtin sites | [electron/sites/builtins/README](../algo-electron/electron/sites/builtins/README.md) |
| submissions | [electron/submissions/README](../algo-electron/electron/submissions/README.md) |
| submission scrapers | [electron/submissions/scrapers/README](../algo-electron/electron/submissions/scrapers/README.md) |
| submission syncers | [electron/submissions/syncers/README](../algo-electron/electron/submissions/syncers/README.md) |
| tracking | [electron/tracking/README](../algo-electron/electron/tracking/README.md) |
| coach | [electron/coach/README](../algo-electron/electron/coach/README.md) |
| coach hints | [electron/coach/hints/README](../algo-electron/electron/coach/hints/README.md) |
| coach problemFacts | [electron/coach/problemFacts/README](../algo-electron/electron/coach/problemFacts/README.md) |
| coach rules | [electron/coach/rules/README](../algo-electron/electron/coach/rules/README.md) |
| db coach | [electron/db/repositories/coach/README](../algo-electron/electron/db/repositories/coach/README.md) |

## Renderer、测试与资源

| 区域 | 文档 |
|---|---|
| renderer | [src/README](../algo-electron/src/README.md) |
| components | [src/components/README](../algo-electron/src/components/README.md) |
| features | [src/features/README](../algo-electron/src/features/README.md) |
| analytics | [src/features/analytics/README](../algo-electron/src/features/analytics/README.md) |
| home | [src/features/home/README](../algo-electron/src/features/home/README.md) |
| problems | [src/features/problems/README](../algo-electron/src/features/problems/README.md) |
| scripts | [src/features/scripts/README](../algo-electron/src/features/scripts/README.md) |
| settings | [src/features/settings/README](../algo-electron/src/features/settings/README.md) |
| coach | [src/features/coach/README](../algo-electron/src/features/coach/README.md) |
| coach styles | [src/features/coach/styles/README](../algo-electron/src/features/coach/styles/README.md) |
| hooks | [src/hooks/README](../algo-electron/src/hooks/README.md) |
| renderer shared | [src/shared/README](../algo-electron/src/shared/README.md) |
| build | [build/README](../algo-electron/build/README.md) |
| public | [public/README](../algo-electron/public/README.md) |
| tests | [tests/README](../algo-electron/tests/README.md) |
| test adapters | [tests/adapters/README](../algo-electron/tests/adapters/README.md) |
| test architecture | [tests/architecture/README](../algo-electron/tests/architecture/README.md) |
| test ai | [tests/ai/README](../algo-electron/tests/ai/README.md) |
| test browser | [tests/browser/README](../algo-electron/tests/browser/README.md) |
| test db | [tests/db/README](../algo-electron/tests/db/README.md) |
| test coach | [tests/coach/README](../algo-electron/tests/coach/README.md) |
| test docs | [tests/docs/README](../algo-electron/tests/docs/README.md) |
| test electron | [tests/electron/README](../algo-electron/tests/electron/README.md) |
| test integration | [tests/integration/README](../algo-electron/tests/integration/README.md) |
| test ipc | [tests/ipc/README](../algo-electron/tests/ipc/README.md) |
| test parsers | [tests/parsers/README](../algo-electron/tests/parsers/README.md) |
| test packaging | [tests/packaging/README](../algo-electron/tests/packaging/README.md) |
| test scripts | [tests/scripts/README](../algo-electron/tests/scripts/README.md) |
| test security | [tests/security/README](../algo-electron/tests/security/README.md) |
| test submissions | [tests/submissions/README](../algo-electron/tests/submissions/README.md) |
| test ui | [tests/ui/README](../algo-electron/tests/ui/README.md) |
| GitHub | [.github/README](../.github/README.md) |
| workflows | [.github/workflows/README](../.github/workflows/README.md) |
| issue templates | [.github/ISSUE_TEMPLATE/README](../.github/ISSUE_TEMPLATE/README.md) |

## 文档维护

- `docs/` 下除 `README.md` 外，Markdown 文件名必须使用大写和下划线。
- 新增长期 Markdown、ADR 或被覆盖目录 README 后，必须同步本文索引。
- 文档中引用具体 `npm run <script>` 时，该脚本必须存在于 `algo-electron/package.json`。
- 数据库 schema 变化必须同步 [DATABASE_SCHEMA](DESIGN/DATABASE_SCHEMA.md)。
- 提交监测、站点 adapter、实时 hook 变化必须同步 [SUBMISSION_MONITORING_DESIGN](DESIGN/SUBMISSION_MONITORING_DESIGN.md) 和 [SITE_ADAPTER_GUIDE](DESIGN/SITE_ADAPTER_GUIDE.md)。
- 文档和示例不得记录 Cookie、用户源码、完整请求体、本机数据库内容或可复用登录态。
