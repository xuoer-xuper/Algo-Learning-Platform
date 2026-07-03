# AI Tests

## 1. 职责

`tests/ai/` 覆盖本地 AI 规则引擎的纯逻辑测试。当前重点是复习建议、薄弱标签和复习计划的评分 helper、标签解析和输出规则。

本目录不调用外部 LLM，不访问真实用户数据库，不读取 Cookie、源码或登录态。

## 2. 当前覆盖

- `recommendationRules.test.ts`：覆盖标签 JSON 解析、复习建议评分、薄弱标签评分、证据文案、复习计划优先级、预估时间和计划天数归一化。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\ai\recommendationRules.test.ts
```

## 4. 新增规则

- 纯函数 helper 优先放这里，用 `tsx` 直接运行。
- 需要真实 SQLite 的 AI 聚合测试应使用临时数据库，并参考 `tests/db/README.md` 的 Electron ABI 运行方式。
- 修改推荐、薄弱标签、复习计划评分口径时，应同步 `electron/ai/recommendations/README.md` 和这里的测试。
