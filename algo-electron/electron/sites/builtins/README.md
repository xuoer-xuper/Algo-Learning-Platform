# Legacy Builtins Path

## 1. 职责

本目录仅保留迁移说明，不承载运行时代码。站点配置已统一迁移到 `electron/db/repositories/site/builtins.ts` 和 SQLite `site_configs`。

## 2. 当前实现程度

旧的 `siteRegistry.ts`、`types.ts` 和各站点 TypeScript 配置已删除；该 README 用于提醒后续维护者不要把第二份内存配置加回来。

## 3. 维护规则

新增或修改内置站点时，只更新 DB seed、adapter/parser、Renderer 映射和测试；登录自动填充 pattern/selector 也必须写入 `site_configs`。

## 4. 验证入口

```powershell
cd algo-electron
npm run test:docs
npm run test:db
```
