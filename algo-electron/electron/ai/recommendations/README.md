# AI Recommendations

## 1. 职责

`electron/ai/recommendations/` 放本地规则引擎形式的学习建议能力，包括复习推荐、复习计划和薄弱标签分析。

本目录不调用外部 LLM，不修改核心数据，不直接服务 renderer；主进程 IPC 或 service 调用这些函数后再返回展示结果。

## 2. 当前实现程度

- `reviewRecommender.ts`：根据错题、未复习、提交和访问数据生成复习建议。
- `reviewPlanner.ts`：生成多天复习计划，并提供 Markdown 渲染。
- `weaknessAnalyzer.ts`：按标签统计薄弱项、通过率和建议。
- `types.ts`：复习建议、薄弱标签、复习计划和内部聚合类型。
- `rules.ts`：评分、阈值、优先级、复习时长和计划天数归一化规则。
- `tagParsing.ts`：题目标签 JSON 安全解析。
- `reviewPlanMarkdown.ts`：复习计划 Markdown 渲染。

## 3. 核心封装

- `getReviewRecommendations(limit)`：返回复习建议列表和数据说明。
- `getReviewPlan(planDays)`：返回按日期分组的复习计划。
- `renderPlanAsMarkdown(plan)`：把复习计划渲染为 Markdown。
- `getWeaknessAnalysis(limit)`：返回薄弱标签分析。
- `scoreReviewCandidate(wrongCount, daysSinceAttempt, visitCount)`：计算复习建议排序分。
- `scoreTagWeakness(acRate, wrongSubmissions, totalDurationSeconds)`：计算标签薄弱评分。
- `determineReviewPriority(score, weaknessTags, problemTags)`：计算复习计划优先级。
- `parseTagsJson(tagsJson)`：解析并清理题目标签。

## 4. 边界规则

- 只读数据库事实数据，不写题目、提交、统计或笔记。
- 输出是建议，不自动修改用户学习数据。
- 每条复习建议和复习计划项必须保留可追溯的 `source` 或 evidence 字段，能回查本地题目、提交、访问或标签统计。
- 输出不得包含 Cookie、源码路径、`raw_json`、完整请求体或可复用登录态。
- 失败时上层应允许 renderer 降级展示，不能阻塞核心页面。
- 需要外部 AI 能力时必须走单独设计，不在这里直接加网络调用。
- 评分阈值集中在 `rules.ts`；修改口径时同步测试和 README。
- 标签解析集中在 `tagParsing.ts`；不要在各规则文件中重复 `JSON.parse(tags_json)`。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npm run test:ai
```

涉及建议口径时补充 AI/repository 相关测试，并手测首页和统计页的降级展示。
