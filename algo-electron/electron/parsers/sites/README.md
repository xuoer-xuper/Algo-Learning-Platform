# Parser Site Extensions

## 1. 职责

`electron/parsers/sites/` 是旧 parser 体系的站点扩展预留目录。

当前内置题目识别已主要委托给 `electron/adapters/sites/` 和 `electron/adapters/registry.ts`，本目录暂无运行时代码。

## 2. 使用边界

- 新站点提交监测不要放到这里，应放到 `electron/adapters/sites/{site}/`。
- 仅当需要维护旧 parser 兼容扩展，且不能归入 adapter 时，才在这里新增文件。
- 新增文件必须说明为什么不能放入 adapter，并同步 `electron/parsers/README.md`。

## 3. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\parsers\siteRules.test.ts
```
