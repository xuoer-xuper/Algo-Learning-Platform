# Scripts 模块说明

## 1. 职责

`electron/scripts/` 管理用户脚本导入、匹配和 IPC。它提供类似 userscript 的本地扩展能力，用于在 OJ 页面注入用户自定义脚本。

本模块不负责内置提交监测 hook。提交监测 hook 属于 `electron/adapters/` 和 `electron/submissions/`。

## 2. 当前实现程度

当前只有 `UserScriptService.ts`：

- 注册用户脚本 IPC。
- 支持读取、创建/更新、导入、启用/禁用、删除脚本。
- 支持打开本地脚本目录。
- 支持解析 userscript metadata。
- 支持按站点配置或 `@match` / `@include` 匹配当前 URL。
- 支持脚本文件存储，不再把导入文件完整代码写入 DB。

## 3. IPC 能力

`UserScriptService` 构造时注册：

- `scripts:getAll`
- `scripts:save`
- `scripts:importFile`
- `scripts:openFolder`
- `scripts:toggle`
- `scripts:delete`

这些 IPC 依赖 `userScriptRepository` 和 Electron `dialog/shell`。

## 4. 核心函数

- `getMatchingScripts(url)`：返回当前 URL 匹配的启用脚本。
- `getMatchingScriptsWithMeta(url)`：返回脚本及其 `@require`、`@resource` 元信息。
- `parseScriptMetadata(code)`：解析 userscript 头部元数据。
- `matchRuleToRegExp(rule)`：把 `@match`/`@include` 规则转为正则。

## 5. 存储规则

- 导入脚本复制到 `app.getPath('userData')/userscripts`。
- DB 保存脚本元信息和 `file_path`。
- `code` 字段保留兼容，但导入路径默认不再存完整代码。

## 6. 边界规则

- 用户脚本是用户扩展能力，不应承载内置站点 adapter 逻辑。
- 不要把用户脚本代码写入普通日志。
- `@require` 和 `@resource` 仅解析元数据，实际加载策略变更需另行设计安全边界。
- 修改 IPC 名称需要同步 preload/renderer 调用。

## 7. 测试入口

当前没有 scripts 单元测试。修改后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及导入或匹配规则时需要手测脚本导入、启用、禁用和目标站点匹配。
