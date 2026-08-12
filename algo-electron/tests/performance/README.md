# Renderer Performance Tests

## 1. 职责

本目录守护 renderer 的初始加载体积和功能级代码拆分，防止重型依赖重新进入首屏入口。

## 2. 当前覆盖

`checkRendererBundle.mjs` 在不启动 Electron 的情况下把生产 renderer 构建到 `tmp/renderer-performance/`，并验证：

- 初始 JavaScript 入口至少比拆分前的 2,221,300-byte 基线降低 35%。
- 设置、统计、Coach 指标、Markdown 聊天和 Milkdown 保持为 lazy chunk。
- Recharts 不进入初始入口，Milkdown 和聊天 chunk 不被首页 HTML 预加载。

## 3. 关键文件

- `checkRendererBundle.mjs`：独立 Vite 构建、产物尺寸断言和 lazy chunk 命名检查入口。

## 4. 维护边界

- 基线只记录拆分前的真实生产入口，不得为了绕过回归而上调。
- 功能重命名导致 chunk 名变化时，应同步更新断言并确认该功能仍按需加载。
- 测试产物只允许写入 `tmp/renderer-performance/`，不得读取或修改真实用户数据。

## 5. 验证入口

```powershell
npm run test:performance
```
