# Script Tests

## 1. 职责

`tests/scripts/` 覆盖用户脚本 metadata、匹配规则和脚本管理纯逻辑，不启动 Electron 窗口。

## 2. 当前覆盖

- `userScriptMetadata.test.ts`：解析 userscript 头部字段、剥离 `@require` / `@resource` hash，并验证 `*://*.domain/*` 同时匹配裸域名和子域名。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\scripts\userScriptMetadata.test.ts
```

## 4. 新增规则

修改用户脚本 metadata 解析、站点匹配或导入默认值时补这里。测试 fixture 不应包含真实用户脚本源码、Cookie、token 或登录态。
