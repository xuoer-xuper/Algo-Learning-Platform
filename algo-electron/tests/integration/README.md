# Integration Tests

## 1. 职责

`tests/integration/` 覆盖跨模块 wiring，验证 parser、adapter、提交监测和标题提取等模块组合后的数据流。

## 2. 当前覆盖

- `leetcodeRealtimeFlow.test.ts`：LeetCode 实时提交 payload 到解析链路。
- `problemTitleExtractionWiring.test.ts`：题目标题提取脚本和 URL 身份识别 wiring。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\integration\leetcodeRealtimeFlow.test.ts
npx --yes tsx tests\integration\problemTitleExtractionWiring.test.ts
```

## 4. 新增规则

当单模块测试不足以证明跨模块契约时，把用例放这里。不要在 integration 测试里访问真实 OJ、真实 Cookie 或用户数据库。
