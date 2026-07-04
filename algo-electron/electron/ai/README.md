# AI 模块说明

## 1. 职责

`electron/ai/` 是本地 AI 上下文和规则引擎层，负责把本地学习数据整理成可导出、可解释、可追溯的结构化结果。

当前实现不直接调用大模型，不保存 Cookie、源码、日志或绝对路径。所有输出基于本地 SQLite 统计、提交、访问、标签和快照数据。

## 2. 当前实现程度

- AI 上下文导出：已实现 JSON 与 Markdown 两种格式。
- 复习建议：已实现本地规则评分。
- 薄弱标签分析：已实现基于 AC 率、错误次数、停留时长的规则分析。
- 阶段学习总结：已实现基于每日快照的周期汇总和上一周期对比。
- 复习计划：已实现结合复习建议与薄弱标签的短期计划生成。
- AI 上下文快照：兼容入口在 `electron/db/repositories/aiContextSnapshotRepository.ts`，内部实现和边界说明在 `electron/db/repositories/aiContextSnapshot/README.md`，schema 由 migration 014 提供。
- AI 输出持久化：兼容入口在 `electron/db/repositories/aiOutputRepository.ts`，内部实现和边界说明在 `electron/db/repositories/aiOutput/README.md`，schema 由 migration 015 提供。

## 3. 文件职责

- `contextExporter.ts`
  - `AI_CONTEXT_VERSION`：AI 上下文 schema 版本。
  - `exportAIContext()`：聚合本地学习上下文。
  - `renderContextAsMarkdown(ctx)`：把上下文渲染为 Markdown。
- `contextTypes.ts`
  - `AIContextExport`：脱敏上下文 schema。
  - `ContextTagStat` / `ContextTagAggregate`：标签维度统计类型。
- `contextTagStats.ts`
  - `aggregateContextTagStats()`：从题目标签、提交状态聚合标签 AC 率。
- `contextMarkdown.ts`
  - `renderContextAsMarkdown(ctx)`：上下文 Markdown 渲染实现。
- `recommendations/reviewRecommender.ts`
  - `getReviewRecommendations(limit)`：基于错题、遗忘时间、访问次数生成复习建议。
- `recommendations/weaknessAnalyzer.ts`
  - `getWeaknessAnalysis(limit)`：基于标签统计生成薄弱标签。
- `recommendations/reviewPlanner.ts`
  - `getReviewPlan(planDays)`：生成短期复习计划。
  - `renderPlanAsMarkdown(plan)`：渲染复习计划。
- `summary/periodSummary.ts`
  - `getPeriodSummary(input)`：按周期生成学习总结。
  - `renderSummaryAsMarkdown(summary)`：渲染周期总结。

Renderer 访问 AI 能力的 IPC 注册在 `electron/ipc/registerAiIpc.ts`。AI 模块本身只提供规则引擎、导出和渲染函数，不直接注册 IPC。

## 4. 数据边界

AI 模块可以读取：

- `problems`
- `submissions`
- `problem_visits`
- `activity_events`
- `daily_stats`
- `ai_context_snapshots`
- 相关 stats repository 聚合结果

AI 模块不得读取或输出：

- Cookie。
- 用户源码正文。
- 本机绝对路径。
- 原始日志内容。
- 未脱敏的浏览器请求体。

## 5. 规则引擎说明

当前 AI 能力是本地规则引擎：

- 复习建议优先未 AC 且错误次数多、长时间未复习、访问多仍未通过的题目。
- 薄弱标签只纳入题量达到统计意义且 AC 率低于阈值的标签。
- 阶段总结基于 `ai_context_snapshots`，缺少快照时结果会自然降级。
- 复习计划会把题目推荐和薄弱标签关联起来，输出可追溯依据。
- AI 上下文导出是脱敏输入边界，只输出统计、题目标识、标题和本地事件摘要，不输出 Cookie、源码、绝对路径或原始请求体。

后续接入大模型时，应把模型调用放在独立 service 中，并保持当前导出层作为脱敏输入边界。

## 6. 测试入口

AI 规则目前主要依赖 TypeScript 类型检查和 repository/schema 回归：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\ai\recommendationRules.test.ts
```

修改 AI 输出或快照持久化时，需要同步检查 `docs/DATABASE_SCHEMA.md`、migration 和对应 repository。
AI 输出 repository 变更还应追加运行 DB 临时库测试：

```powershell
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
