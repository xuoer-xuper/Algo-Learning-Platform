# Scripts Feature

## 1. 职责

`src/features/scripts/` 负责用户脚本管理器的 renderer 层，包括脚本导入、启停、绑定站点、删除和打开脚本目录。

本目录只管理用户可见配置，不执行脚本注入、不扫描远程页面、不直接访问脚本文件系统。

## 2. 当前实现程度

- `UserScriptManager.tsx`：用户脚本管理弹层入口，负责加载脚本和站点数据。
- `UserScriptList.tsx`：脚本列表、启停、选择和删除。
- `UserScriptEditor.tsx`：脚本名称和站点绑定编辑。
- `scriptsApi.ts` 集中封装脚本相关 preload 调用。
- `types.ts` 定义脚本和站点展示类型。

## 3. API 封装

`scriptsApi.ts` 当前对外封装：

- `loadUserScriptManagerData()`：并发读取脚本列表和站点列表。
- `importUserScriptFile()`：打开导入流程，由主进程处理文件复制和记录创建。
- `saveUserScriptSites(scriptId, name, selectedSiteIds)`：保存脚本名称和站点绑定。
- `toggleUserScript(scriptId, enabled)`：启停脚本。
- `deleteUserScript(scriptId)`：删除脚本记录和对应文件。
- `openUserScriptsFolder()`：打开脚本目录。

## 4. 边界规则

- 脚本注入逻辑属于主进程 `electron/scripts/`，renderer 不直接执行用户脚本。
- 站点绑定存储格式由主进程 schema 决定，renderer 只通过 API 提交选择结果。
- 导入、删除、打开目录必须走 preload 白名单，不使用浏览器文件 API 绕过主进程。
- 新增脚本管理动作时优先扩展 `scriptsApi.ts`。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\ui\rendererScreenshots.test.ts
```

涉及脚本文件操作时还需要 `npm run dev` 手测导入、启停、绑定站点、删除和打开目录。
