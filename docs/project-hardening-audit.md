# 项目结构巩固收尾审计

## 1. 审计目标

本审计用于判断“项目标准化巩固”是否可以从持续拆分阶段进入收尾验收阶段。

审计口径：

- 关键目录应有 README，说明职责、实现程度、核心封装、边界和验证入口。
- 主要业务模块应按职责拆分，兼容入口保留稳定导出。
- 行数较大的剩余文件必须分类处理：继续拆分、明确暂缓，或记录为生成/类型文件。
- 不为了行数继续改动已手测稳定的提交监测 hook、站点 scraper 或实时入库链路。

## 2. README 覆盖

当前覆盖审计命令：

```powershell
$targets = @('algo-electron\src','algo-electron\electron','algo-electron\tests')
$missing = @()
foreach ($target in $targets) {
  if (-not (Test-Path (Join-Path $target 'README.md'))) { $missing += (Resolve-Path $target).Path }
  $missing += Get-ChildItem $target -Directory -Recurse |
    Where-Object { -not (Test-Path (Join-Path $_.FullName 'README.md')) } |
    Select-Object -ExpandProperty FullName
}
$missing
```

当前结果：无输出，表示 `src`、`electron`、`tests` 根目录及其现有子目录均已有 README。

非源码长期维护目录也已补充 README：

- `.github/`
- `.github/ISSUE_TEMPLATE/`
- `.github/workflows/`
- `algo-electron/build/`
- `algo-electron/public/`

本地工具目录如 `.idea/`、`.agents/`、`.claude/` 不作为项目交付文档覆盖对象。

新增关键 repository 子目录均已纳入 `docs/README.md`：

- `electron/db/repositories/account/`
- `electron/db/repositories/aiContextSnapshot/`
- `electron/db/repositories/aiOutput/`
- `electron/db/repositories/problem/`
- `electron/db/repositories/site/`
- `electron/db/repositories/stats/`
- `electron/db/repositories/submission/`
- `electron/db/repositories/userScript/`

## 3. 已完成结构收口

主进程和数据层：

- `electron/main.ts` 已收口到启动编排，IPC、session、服务初始化、预连接、用户脚本注入和 smoke 逻辑均已拆到对应目录。
- `electron/README.md` 已作为主进程总览，记录根文件、子目录职责、关键封装入口、实现程度和验证入口。
- `electron/ipc/` 已按业务域拆分 channel 注册。
- `electron/db/repositories/` 已按业务域拆出 account、AI snapshot、AI output、problem、site、stats、submission、userScript 内部实现目录，并保留原兼容导出口。
- `electron/ai/` 已拆分 context、recommendations、summary 的类型、规则、聚合和 Markdown 渲染。
- `electron/notes/` 已拆分 DB 编排、文件存储、附件协议和文本统计。
- `electron/browser/TabManager.ts` 已拆出类型、配置、URL 匹配、布局和跨 frame 脚本执行 helper。

提交监测与 adapter：

- 七站提交监测已按用户手测通过收口。
- adapter 已按站点目录组织，`registry` 只负责注册和查找。
- Nowcoder、VJudge 已采用网络结果驱动或强身份关联，避免自测/公开状态行误入库。
- 通用提交表格扫描器已拆分类型、列识别、提交 ID 提取和字段归一化。

Renderer：

- 大型 feature 组件已拆分出 panels、lists、forms、editor、hooks 和 API helper。
- preload 调用已收敛到 feature 内部 `*Api.ts` 或共享 shell API。
- 统计页平台分布布局已截图验证，饼图和柱图均有绘制断言。

根文档：

- `README.md`、`ARCHITECTURE.md`、`DATABASE_SCHEMA.md`、`TASKS.md`、`AI_HANDOFF.md` 和调研文档已完成当前状态一致性修正；历史调研只作为背景，不覆盖当前设计文档和模块 README。
- `CONTRIBUTING.md` 已作为贡献入口，覆盖本地开发、验证入口、修改边界、隐私要求和 PR 检查清单。
- `SECURITY.md` 已作为安全与隐私入口，集中说明敏感信息禁区、安全报告范围和验证边界。
- `.editorconfig` 与 `.gitattributes` 已固定基础编辑器格式、默认 LF、Windows 脚本 CRLF 和二进制资源处理策略。
- `LICENSE` 已补齐 MIT 许可证文本，`algo-electron/package.json` 已同步 `license: MIT`。

测试入口：

- `tests/run-tests.mjs` 已封装核心、adapter、submissions、DB、Electron smoke 和 UI screenshot 验证；`package.json` 提供 `test:*` scripts，后续文档和交接优先引用 npm 脚本。
- `.github/workflows/ci.yml` 已接入 `npm run test:all`，覆盖 pull request 和 main/master push 的自动验证；真实 OJ 登录态、七站提交和安装卸载仍按人工验收清单执行。
- `.github/pull_request_template.md` 与 `.github/ISSUE_TEMPLATE/` 已覆盖 PR 验证清单、普通缺陷和提交监测问题收集，并要求确认不包含敏感登录态、源码或完整请求体。
- `.github/`、`algo-electron/build/` 和 `algo-electron/public/` 已补 README，说明协作模板、CI、打包资源、静态资源、敏感信息边界和验证入口。
- `tests/docs/check-docs.mjs` 已把 Markdown 相对链接、README 覆盖、README 内容质量、`docs/README.md` 总索引覆盖和文档 `npm run` 脚本引用检查接入 `npm run test:docs` 与 `npm run test:all`。
- `tests/architecture/check-architecture.mjs` 已把 BrowserView、preload、renderer IPC、Nowcoder/VJudge 实时入库等红线接入 `npm run test:architecture` 与 `npm run test:core`。
- `tests/packaging/check-packaging.mjs` 已把 electron-builder 输入白名单、敏感排除、NSIS、asarUnpack 和 build scripts 检查接入 `npm run test:packaging` 与 `npm run test:all`。
- `tests/security/check-sensitive-files.mjs` 已把 `.env`、本地数据库、日志文件和高置信 Cookie/header/token 明文模式检查接入 `npm run test:security` 与 `npm run test:core`。

## 4. 剩余大文件处置

以下文件仍较大，但当前不建议继续机械拆分：

| 文件 | 行数级别 | 处置 |
|---|---:|---|
| `electron/adapters/shared/frontendVerdictHook.ts` | 600+ | 浏览器注入脚本，涉及 submit intent、pending、DOM observer 和站点误触发边界；当前只记录风险，不在收尾阶段继续拆。 |
| `electron/submissions/scrapers/ptaScraper.ts` | 600+ | PTA 专用 scraper，行为依赖站点 DOM/API 差异；已稳定，不在收尾阶段继续拆。 |
| `electron/adapters/sites/vjudge/hook.ts` | 500+ | VJudge 弹窗提交和状态接口 hook，用户已手测通过；不恢复 DOM verdict observer，不在收尾阶段继续拆。 |
| `electron/adapters/sites/nowcoder/hook.ts` | 300+ | Nowcoder 正式提交/自测隔离 hook，已手测通过；不在收尾阶段继续拆。 |
| `electron/submissions/scrapers/luoguScraper.ts` | 300+ | 洛谷 scraper，用户确认原本稳定；避免为行数改动。 |
| `electron/electron-env.d.ts` | 300+ | preload 类型声明集中处，属于契约型类型文件；后续新增 API 时维护，不拆。 |
| `electron/browser/TabManager.ts` | 300+ | 已完成低风险 helper 拆分；`createView()` 中实时事件绑定暂保留，避免影响提交监测。 |

可选后续拆分候选：

- `SiteManagementPanel.tsx`、`ProblemDetail.tsx`、`NotePanelModal.tsx` 等 UI 文件可在后续 UI 专项中继续微拆。
- `frontendVerdictHook.ts` 如后续确需拆分，应先补更细的 browser hook 单元测试，再拆 submit intent、observer、payload 上报三块。

## 5. 完成判定

项目结构巩固可以进入收尾验收的条件：

- README 覆盖审计无缺口。
- `TASKS.md`、`AI_HANDOFF.md`、`docs/README.md` 对本轮拆分记录一致。
- `docs/project-hardening-evidence.md` 能把用户目标拆到当前证据和剩余验收项。
- 关键自动测试全部通过。
- 剩余大文件均已分类，且行为敏感文件不再为行数冒险改动。
- 最终给出用户手测清单，由用户按清单统一验收。

仍不应标记完成的事项：

- `P8-007` changelog 标准是持续维护项，当前保持进行中。
- `P8-008` 打包配置标准是持续维护项，当前保持进行中。
- `P8-009`、`P8-012` 仍是发布与总验收任务，不随结构拆分自动完成。

已补齐的发布/恢复文档：

- `P8-010`：`docs/troubleshooting.md`。
- `P8-011`：`docs/database-migration-rollback.md`。
- `P8-069`：`docs/release-process.md`，作为 `P8-009` 和 `P8-012` 的发布执行手册。
- `P8-070`：`.github/`、`algo-electron/build/` 和 `algo-electron/public/` 目录 README。
- `P8-071`：`algo-electron/electron/README.md` 主进程总览。
- `P8-072`：文档一致性自动验证入口。
- `P8-073`：架构红线自动验证入口。
- `P8-074`：打包配置自动验证入口。
- `P8-075`：敏感文件自动验证入口。

## 6. 自动验证清单

结构收口后的最低自动验证：

```powershell
cd algo-electron
npm run typecheck
npm run test:core
npm run test:architecture
npm run test:security
npm run test:docs
npm run test:packaging
npm run test:db
npm run test:electron
npm run test:ui
```

提交监测相关改动还应追加 `npm run test:adapters`、`npm run test:submissions` 和七站手测。

文档链接、README 覆盖、README 内容质量、总索引覆盖和 npm script 引用由 `npm run test:docs` 检查。空白和换行问题另跑：

```powershell
git diff --check
```

若 `git diff --check` 只有既有 LF/CRLF 规范提示，可记录为非阻塞提示；出现 trailing whitespace 或 conflict marker 必须修复。

最近一次验证记录：

- 2026-07-04：`npm run test:all` 通过，覆盖 typecheck、lint、架构红线、敏感文件、IPC、AI、用户脚本、browser、parser、integration、adapter、submissions、DB、docs、packaging、Electron smoke 和 UI screenshot。
- 2026-07-04：`git diff --check` 仅报告 `algo-electron/electron-builder.json5` 与 `docs/README.md` 的 LF/CRLF 规范提示，无 trailing whitespace 或 conflict marker。

## 7. 用户手测清单

详细步骤见 [final-acceptance-checklist.md](final-acceptance-checklist.md)，记录格式见 [manual-acceptance-report-template.md](manual-acceptance-report-template.md)。最终交付前建议用户统一手测：

- 七站实时提交监测：Codeforces、AcWing、Nowcoder、VJudge、PTA、Luogu、LeetCode。
- 手动同步：Codeforces API 同步、当前页面提交记录同步、题目详情提交列表。
- 统计页：平台分布饼图/柱图、趋势图、AI 建议、错题/未复习列表。
- 题目页：题目列表筛选、题目详情、删除题目、笔记弹层、图片上传。
- 设置页：默认首页、Codeforces 账号绑定/同步、实时提交诊断、站点导入导出。
- 用户脚本：导入、启用、禁用、删除、目标站点匹配。
- 打包产物：安装、启动、数据目录、基本导航、无测试/tmp/release/.env 泄漏。

发布安装包前还必须按 [release-process.md](release-process.md) 完成版本、changelog、自动验证、打包、产物检查、安装升级卸载验收和交接记录。
