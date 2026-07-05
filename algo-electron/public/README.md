# 静态资源目录

## 1. 职责

`public/` 存放 Vite 原样复制到 renderer 构建产物的静态文件。这里的文件可以被 renderer 直接引用，但不经过 TypeScript 编译，也不应包含业务状态或用户数据。

## 2. 当前文件

- `home.html`：应用内默认/兜底静态首页资源。
- `electron-vite.svg`：模板遗留静态资源，当前只作为公开静态资源存在；后续若确认无引用，可在单独清理任务中删除。

## 3. 实现程度

Vite 构建时会把本目录文件复制到 `dist/`。Electron 运行时代码、IPC、数据库访问、提交监测 hook 和站点适配逻辑不在本目录实现。

## 4. 修改边界

- 不在静态 HTML 或资源中写入 Cookie、session、csrf token、用户源码、完整请求体、本机数据库内容或可复用登录态。
- 不在这里新增需要 Node/Electron 权限的代码；renderer 本地能力必须通过 `window.electronAPI` 白名单 API。
- 修改 `home.html` 后需要跑 renderer 相关验证，确认默认首页和基础布局没有回归。
- 删除或替换资源前先用 `rg` 查引用，避免破坏 Vite 或 renderer 引用。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:ui
npm run build
```

发布前使用 `npm run test:all` 和 `docs/OPERATIONS/RELEASE_PROCESS.md` 的打包检查。
