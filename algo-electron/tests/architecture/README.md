# Architecture Tests 说明

## 1. 职责

`tests/architecture/` 存放架构红线检查。它用静态扫描把项目契约里最容易回归的边界变成自动验证，避免后续重构时把旧实现或高风险入口带回来。

## 2. 当前检查

`check-architecture.mjs` 当前覆盖：

- 运行时代码不得重新导入或实例化 Electron `BrowserView`。
- Renderer 源码不得直接访问 `ipcRenderer`。
- `preload.ts` 不得暴露通用 `ipcRenderer`、`send` 或 `invoke` 能力。
- Nowcoder 实时提交链路不得引用通用 DOM verdict observer，必须保留 `nowcoder-judge-status` 网络 payload。
- VJudge 实时提交链路不得引用通用 DOM verdict observer，必须保留 solution/status 强关联 token。

## 3. 验证入口

```powershell
cd algo-electron
npm run test:architecture
```

发布前使用：

```powershell
npm run test:all
```

## 4. 维护边界

- 新增架构红线时，优先写成明确、低误报的静态检查。
- 不用本测试约束普通命名，例如 renderer helper 中的 `hideBrowserView` 只是 UI 语义，不代表 Electron `BrowserView` 依赖。
- 如果确实需要改变浏览器容器、IPC 暴露方式或 Nowcoder/VJudge 实时入库策略，先更新 ADR、设计文档和相关 adapter/submissions 测试。
