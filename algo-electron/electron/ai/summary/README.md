# AI Summary

## 1. 职责

`electron/ai/summary/` 放本地学习阶段总结能力，把一段时间内的学习、提交、题目和标签数据整理成结构化摘要。

当前实现是本地规则汇总，不调用外部 LLM，不修改核心数据。

## 2. 当前实现程度

- `periodSummary.ts`：兼容导出口和总结编排入口，支持 weekly、monthly、custom 三类周期输入。
- `periodSummaryTypes.ts`：周期总结输入、输出和内部聚合结果类型。
- `periodSummaryDates.ts`：本地日期天数、上一周期和周期类型计算。
- `periodSummaryAggregation.ts`：从每日 AI 上下文快照聚合周期学习量、平台分布和薄弱标签。
- `periodSummaryMarkdown.ts`：把结构化总结渲染为 Markdown。

## 3. 核心封装

- `getPeriodSummary(input)`：根据时间范围生成 `PeriodSummary`。
- `renderSummaryAsMarkdown(summary)`：把总结渲染为 Markdown 文本。
- `PeriodSummaryInput`：总结输入，包括周期类型、起止日期等。
- `PeriodSummary`：总结输出，包括概览、亮点、风险和建议。
- `getSnapshotsInPeriod(snapshots, startDate, endDate)`：筛选周期内快照。
- `aggregateFromSnapshots(snapshots)`：聚合周期内每日快照。
- `countInclusiveDays(start, end)` / `getPreviousPeriod(start, end)`：本地日期周期 helper。

## 4. 边界规则

- 只读事实数据和统计结果，不写数据库。
- Markdown 渲染只用于展示或保存 AI 输出，不包含 Cookie、源码或请求体。
- 周期口径应和 stats/repository 的本地日期口径保持一致。
- `periodSummary.ts` 是外部稳定入口；IPC 不直接 import 内部 helper。
- 快照列表按 `listSnapshots()` 的 DESC 顺序处理，周期末累计型统计取周期内最新快照。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及输出格式时手测 AI 输出保存、查看和删除流程。
