# ADR-0001：使用 WebContentsView 作为唯一浏览器视图

## 状态

已接受

## 背景

项目需要内嵌 OJ 网站，支持登录、刷题、提交代码、监听 URL、保存登录状态和未来多标签页。早期代码中存在 `BrowserView` 实现，但项目希望从初期就奠定长期基础，不留下未来迁移隐患。

Electron 已提供 `WebContentsView` 作为更适合长期维护的浏览器视图方案。

## 决策

项目统一使用 `WebContentsView` 作为唯一浏览器视图。

禁止继续在 `BrowserView` 上新增功能。当前已有 `BrowserView` 代码必须通过 `P1-003` 迁移。

浏览器视图生命周期由 `BrowserHost` 管理。

## 影响

正面影响：

- 初期即对齐长期架构。
- 减少未来迁移成本。
- 便于封装多标签页。
- 便于统一处理 session、Cookie、导航和权限。

代价：

- Phase 1 初期需要先做迁移。
- 当前已有 BrowserView 代码不能继续复用式扩展。

## 执行要求

- `electron/main.ts` 只保留启动编排。
- 新增 `electron/browser/BrowserHost.ts`。
- Renderer 只能通过 Preload API 控制导航。
- 远程页面不得启用 Node 能力。

