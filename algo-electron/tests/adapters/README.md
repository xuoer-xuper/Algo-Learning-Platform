# Adapter Tests

## 1. 职责

`tests/adapters/` 覆盖站点 adapter、registry、提交表格解析和实时 hook payload 解析。这里验证每个站点 adapter 对外行为稳定，不启动 Electron。

## 2. 当前覆盖

- `adapterRegistry.test.ts`：内置 adapter 注册和查找。
- `codeforcesAdapter.test.ts`：Codeforces 题目身份、提交记录和实时结果解析。
- `genericTableSiteAdapters.test.ts`：AcWing、Nowcoder、VJudge、PTA、洛谷等通用表格/网络 payload 场景。
- `leetcodeAdapter.test.ts`：LeetCode CN URL、题目身份和提交结果解析。
- `specializedScraperSiteAdapters.test.ts`：需要专用 scraper 的站点适配场景。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\adapters\genericTableSiteAdapters.test.ts
```

全量 adapter 测试可按 `tests/README.md` 中的批量 esbuild 命令运行。

## 4. 新增规则

新增或修改站点 adapter 时，至少补 pending/final/duplicate/self-test/view-history 中受影响的样例。测试输入不得包含 Cookie、登录态或用户源码。
