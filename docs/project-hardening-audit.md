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
Get-ChildItem algo-electron\src,algo-electron\electron,algo-electron\tests -Directory -Recurse |
  Where-Object { -not (Test-Path (Join-Path $_.FullName 'README.md')) }
```

当前结果：无输出，表示 `src`、`electron`、`tests` 下现有子目录均已有 README。

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

## 6. 自动验证清单

结构收口后的最低自动验证：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npm run lint
npx --yes tsx tests\ipc\ipcContracts.test.ts
npx --yes tsx tests\electron\startupSmoke.test.ts
npx --yes tsx tests\ai\recommendationRules.test.ts
npx --yes tsx tests\scripts\userScriptMetadata.test.ts
npx --yes tsx tests\parsers\siteRules.test.ts
npx --yes tsx tests\submissions\realtimeTabActivation.test.ts
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

提交监测相关改动还应追加 adapter/submission 全量测试和七站手测。

文档一致性还应检查：

```powershell
git diff --check
```

并确认 Markdown 相对链接、README 覆盖和过期入口扫描无新增缺口。

## 7. 用户手测清单

详细步骤见 [final-acceptance-checklist.md](final-acceptance-checklist.md)。最终交付前建议用户统一手测：

- 七站实时提交监测：Codeforces、AcWing、Nowcoder、VJudge、PTA、Luogu、LeetCode。
- 手动同步：Codeforces API 同步、当前页面提交记录同步、题目详情提交列表。
- 统计页：平台分布饼图/柱图、趋势图、AI 建议、错题/未复习列表。
- 题目页：题目列表筛选、题目详情、删除题目、笔记弹层、图片上传。
- 设置页：默认首页、Codeforces 账号绑定/同步、实时提交诊断、站点导入导出。
- 用户脚本：导入、启用、禁用、删除、目标站点匹配。
- 打包产物：安装、启动、数据目录、基本导航、无测试/tmp/release/.env 泄漏。
