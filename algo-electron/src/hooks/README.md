# Hooks 模块说明

## 1. 职责

`src/hooks/` 存放 renderer 应用壳或跨组件复用的轻量 React hooks。Hook 可以编排 UI 状态并通过本目录 helper 调用已有 preload 能力，但不能包含数据库、Cookie、站点解析或提交监测业务规则。

## 2. 当前实现程度

当前应用壳 hooks 负责浏览器导航编排；内部页归属由主进程标签模型和 `ShellRouter` 决定，不在 hook 中维护第二套 modal/view 可见性状态。

- `useBrowserNavigation.ts`
  - 维护地址栏 URL、侧栏宽度和当前页同步提示。
  - 封装地址栏跳转、首页、前进、后退、刷新、URL 变化监听、侧栏宽度同步和当前页提交抓取。
  - 将 App 壳层的浏览器 IPC 调用集中到一个应用级 hook。
- `browserShellApi.ts`
  - 封装 URL 监听、导航、侧栏宽度、当前页提交抓取、查找 request、缩放状态、下载通知、脚本安装请求和凭据提示 preload 调用。
  - 服务应用壳 hooks 与 `App.tsx` 本身，不保存 React state，不包含站点解析、提交监测或数据库规则。
  - 凭据提示（自动填充 / 保存捕获）与 userscript host 授权同一形状：`get*` 取当前 pending，`subscribe*` 收后续推送，`respond*` 回决定。壳层只收脱敏摘要，密码明文不经过 renderer。
- `dataRefreshApi.ts`：唯一的 `data:changed` 订阅 adapter，供 `DataRefreshProvider` 接入。
- `useIpcQuery.ts`：`useIpcQuery(fetcher, deps, { tables, enabled })`。仅 `deps` 的逐项值变化启动新查询身份，逻辑域集合按值去重；初次/切实体加载使用 `isLoading`，后台重读使用 `isRefetching` 并保留已加载数据。旧请求、禁用和卸载后的响应不能覆盖当前值；错误放入 `error`，自动刷新不抛未处理 rejection。`refetch()` 返回当前成功值或 `undefined`（失败、切换查询身份、卸载或禁用）；同身份后台请求抢先发出时，手动调用仍拿到自己的结果，但旧结果不会覆盖新状态。禁用时手动 refetch 不读取，重新启用会重新加载。
- `useIpcSubscription.ts`：用于提示/比赛状态等 snapshot + live stream；先订阅再读取，live update 或本地 dismiss 优先于仍在途的初始快照，卸载后均失效。
- `useIpcQueryError.ts`：将 query 的错误接入现有 renderer 错误通知，副作用不嵌进 fetcher。

## 3. 边界规则

- Hook 只封装 renderer 状态机和 UI 编排。
- Hook 与 `App.tsx` 内部一律调用 `browserShellApi.ts` 等本目录 helper，不直接散落新的 `window.api` 调用。`App.tsx` 需要 Coach 数据时从 `features/coach/coachDataApi.ts` 导入。
- 新增 IPC 调用必须先确认 `src/preload/index.ts` 已声明，类型由该 API 推导。
- 数据查询组件必须位于 `DataRefreshProvider` 内；测试使用显式 provider/订阅替身，不在生产缺少 preload 时静默跳过刷新。
- 不在 hook 内读取 Cookie、SQLite、文件系统或网页 DOM。
- 对业务域强绑定的 hook 优先放在对应 `features/{domain}/` 内；只有应用壳或跨 feature 使用的 hook 放在这里。

## 4. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及内部页标签或导航时，还需要 `pnpm run dev` 手测对应入口。
