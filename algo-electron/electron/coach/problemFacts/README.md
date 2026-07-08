# Coach 题面约束解析

## 1. 职责

`electron/coach/problemFacts/` 负责从内嵌浏览器的题面页面中自动抽取数据范围与时限约束，与 verdict 联动生成零 LLM 靶向提示。解析失败时静默退化到通用提示。

## 2. 当前实现程度

- `ConstraintParser.ts`：正则解析题面约束文本，支持 CF/洛谷先行，复用现有 parsers/sites 站点扩展点。
  - 数据范围：`1 ≤ n ≤ 2·10^5`、`1 ≤ a_i ≤ 10^9` 等模式。
  - 时限：`时间限制 1.00s`、`Time limit: 1 second` 等。
  - 与 verdict 联动：TLE → 数值对照提示，WA 且值域 ≥ 1e9 → 溢出提示。
  - 解析结果内存缓存（key 为 problemId）。

## 3. 封装函数与核心类型

- `ConstraintParser.parse(text)` → `ProblemConstraints | null`。
- `ConstraintParser.fetchAndParse(problemId, url)` → 异步注入脚本抓取并解析。
- `ProblemConstraints` 接口：`nLower` / `nUpper` / `valueUpper` / `timeLimitMs`。

## 4. 边界规则

- 解析失败必须静默退化（返回 null），不阻塞主流程。
- 注入脚本遵循现有 parsers/sites 模式。
- 缓存仅内存，不落库（是否需 `026_problem_constraints.ts` 待阶段 4 评估）。
- 不修改核心事实表。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:coach
```

覆盖测试：62 个单元测试，对样例题面抽取准确率 91.5%（目标 ≥ 80%）。
