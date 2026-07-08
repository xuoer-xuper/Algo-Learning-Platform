# Coach 测试

## 1. 职责

`tests/coach/` 是 AI Coach 的单元测试目录，覆盖规则引擎、ContestGuard、提示模板、提示选择、Socratic Ladder、反馈存储与题面约束解析。

## 2. 当前实现程度

- `ruleEngine.test.ts`：24 个测试，覆盖核心规则、节流、防 abuse、比赛硬关闭、never_today、难度自适应。
- `contestGuard.test.ts`：30 个测试，覆盖 URL 识别、时间窗、生命周期、hard gate、forceEnd。
- `hintTemplates.test.ts`：31 个测试，覆盖模板数量、分类、字段完整性。
- `hintSelector.test.ts`：45 个测试，覆盖 verdict→类别映射、轮询选择、退化。
- `hintLadder.test.ts`：41 个测试，覆盖 6 级升级、L5 二次确认、冷却。
- `coachFeedbackStore.test.ts`：34 个测试，覆盖反馈持久化与频率影响。
- `constraintParser.test.ts`：62 个测试，覆盖正则解析、verdict 联动、退化、准确率。

## 3. 关键文件

- 测试入口：`tests/run-tests.mjs` 的 `coach` suite。
- 运行命令：`npm run test:coach`。

## 4. 边界规则

- 测试不依赖真实数据库，使用 fakeDb 或内存模拟。
- ConstraintParser 测试含 20 道样例题面准确率验证。
- 测试覆盖必须随新增规则同步更新。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:coach
npm run test:all
```

合计 267 个单元测试（含 Coach 全部 + 其他模块）。
