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
- AI 输出持久化：repository 在 `electron/db/repositories/aiOutputRepository.ts`，schema 由 migration 015 提供。

## 3. 文件职责

- `contextExporter.ts`
  - `AI_CONTEXT_VERSION`：AI 上下文 schema 版本。
  - `exportAIContext()`：聚合本地学习上下文。
  - `renderContextAsMarkdown(ctx)`：把上下文渲染为 Markdown。
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

后续接入大模型时，应把模型调用放在独立 service 中，并保持当前导出层作为脱敏输入边界。

## 6. 测试入口

AI 规则目前主要依赖 TypeScript 类型检查和 repository/schema 回归：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

修改 AI 输出或快照持久化时，需要同步检查 `DATABASE_SCHEMA.md`、migration 和对应 repository。
