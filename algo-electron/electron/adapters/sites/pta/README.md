# PTA Adapter

## 1. 职责

`electron/adapters/sites/pta/` 负责 PTA 题目识别、实时提交结果解析和提交记录页上下文补全。

## 2. 当前实现程度

- `index.ts` 组装 `ptaAdapter`。
- `problem.ts` 解析题集和题目 ID，并构造 canonical URL。
- `submissions.ts` 连接 adapter 实时 hook、实时 payload 解析和题目 ID 读取。
- PTA 专用页面 scraper 位于 `electron/submissions/scrapers/ptaScraper.ts`。

## 3. 关键函数

- `buildPtaCanonicalUrl(setId, problemSetProblemId)`：构造题目 canonical URL。
- `parsePtaProblem(url)`：解析题目身份。
- `matchPtaRealtimeCandidateUrl(url)`：判断可注入实时监听的页面。
- `createPtaAdapterRealtimeHookScript(siteId)`：生成实时 hook。
- `parsePtaRealtimeSubmission(raw)`：解析最终提交结果。
- `readPtaProblemIdFromSubmission(submission)`：从提交 raw 信息补题目 ID。

## 4. 边界规则

- 查看提交记录页时允许手动同步，但不能伪造实时提交。
- pending/judging 中间状态不入库。
- PTA 页面上下文复杂，题目关联优先使用 setId 和 problemSetProblemId。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\adapters\genericTableSiteAdapters.test.ts
```
