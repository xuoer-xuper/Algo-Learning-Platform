# Renderer Context 说明

## 1. 职责

维护跨组件共享的刷新订阅，不保存业务实体、不接触数据库、凭据或 Cookie。

## 2. 当前实现

`DataRefreshProvider` 在每个 renderer root 建立一个 `data:changed` 原生订阅，
将逻辑域变更分发给 `useIpcQuery`；事件不包含行数据或敏感信息。

## 3. 关键文件

- `DataRefreshContext.tsx`：provider 的订阅和卸载生命周期。
- `data-refresh-context.ts`：context 与消费 hook，和组件分开以保持 Fast Refresh。
- IPC 接入只通过 `src/hooks/dataRefreshApi.ts`，context 不直接引用 preload。

## 4. 边界与维护规则

应用路由及独立测试 harness 必须显式挂 provider。测试可以注入 `subscribe` 控制事件，
但生产环境缺少 preload/provider 属于配置错误，不能静默降级为空订阅。
StrictMode 重挂载后只保留一个原生监听，卸载时释放。

## 5. 验证入口

```powershell
pnpm vitest run tests/components/ipcQuery.test.tsx tests/components/dataRefreshSurfaces.test.tsx
pnpm test:ui
```
