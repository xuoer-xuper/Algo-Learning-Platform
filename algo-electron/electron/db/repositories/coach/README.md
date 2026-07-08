# Coach Repository

## 1. 职责

`electron/db/repositories/coach/` 是 AI Coach 的数据仓库层，负责 `coach_events` / `coach_interventions` / `coach_feedback` 三张表的增删查改。本目录不生成提示、不调用规则引擎、不修改核心事实表。

## 2. 当前实现程度

- `eventsRepository.ts`：`coach_events` 表的插入与查询（`insertCoachEvent` / `listCoachEvents` / `listCoachEventsByType` / `listCoachEventsByProblem` / `listCoachEventsSince`）。
- `interventionsRepository.ts`：`coach_interventions` 表的插入与查询，含比赛模式审计字段（`insertCoachIntervention` / `listCoachInterventions` / `listCoachInterventionsByProblem` / `listContestAuditRecords` / `countContestAuditSince`）。
- `feedbackRepository.ts`：`coach_feedback` 表的插入与查询（`insertCoachFeedback` / `getNeverTodayEventTypes` / `countNeverTodaySince` / `listCoachFeedbackSince`）。
- `index.ts`：barrel export。

## 3. 封装函数

- Events：`insertCoachEvent(db, event)` / `listCoachEvents(db, limit)` / `listCoachEventsByProblem(db, problemId)`。
- Interventions：`insertCoachIntervention(db, intervention)` / `listContestAuditRecords(db)`。
- Feedback：`insertCoachFeedback(db, feedback)` / `getNeverTodayEventTypes(db)`。

## 4. 边界规则

- 只用 `getDb()`，不做网络请求。
- 不修改核心事实表（submissions / problem_visits / activity_events / user_daily_stats）。
- `coach_interventions` 表同时承载干预记录与比赛模式审计日志。
- Schema 变化必须先写 migration。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
