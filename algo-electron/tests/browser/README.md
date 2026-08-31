# Browser Tests

## 1. 职责

`tests/browser/` 覆盖 OJ WebContents preload bridge、导航策略、权限策略和受管弹窗的纯逻辑及 Electron test-double 契约。

## 2. 当前覆盖

- `ojBridge.test.ts`：`__algo_submission_v1` channel、同窗口/子 frame message 转发和非法 message 忽略。
- `ojPreloadModule.test.ts`：模块级执行 `electron/browser/ojPreload.ts`（jsdom）。覆盖 token 由 preload 主动 pull 的那条链——首次 token 非法后重试、重试仍拿不到就静默丢弃、token 请求抛错也丢弃——以及 `pageUrl` 与 `location.href` 一致才回填、表单 submit 才捕获且无密码字段不捕获。`ojSubmissionBridgeSmoke.test.ts` 在真实 Electron 里验的是同一个文件的正向链路，这里补的是它造不出来的拒绝分支。
- `navigationPolicy.test.ts`：生产 HTTPS、受控 about:blank、开发 loopback HTTP 与未知协议拒绝。
- `internalPage.test.ts`：canonical `algo://` 地址正反向互逆，以及额外路径/参数/hash/userinfo/非 canonical 编码拒绝。
- `omnibox.test.ts`：内部页/HTTPS URL/搜索三分流、bare host 推断、开发 loopback、稳定阻断原因、内置搜索 URL 与 custom HTTPS 模板校验。
- `permissionPolicy.test.ts`：敏感权限默认拒绝，以及默认/OJ session 的 permission check/request 双处理器安装。
- `ojSession.test.ts`：确认 OJ session 不安装全局 CORS 响应重写，同时保持 HTML mainFrame 的 `onResponseStarted` stealth 注入。
- `tabManagerTypes.test.ts`：内部页判别联合的严格参数白名单与长度边界。
- `tabManagerPageEvents.test.ts`：页面事件的 per-webContents 身份（后台标签导航与生命周期）、iframe 导航不改标签页与顶层 URL、关闭与 teardown 重叠时 `destroyed` 只发一次、按事件身份执行脚本并拒绝陈旧归属。`did-navigate` 与 `did-navigate-in-page` 的主框架路径参数化跑同一份期望——两者守卫之后有 14 行字节完全相同，一份期望同时约束两个孪生实现，覆盖 URL 重绑、重新施加站点缩放、查找栏先清 id 再重算版面的顺序，以及同址重复上报不落盘会话、不拆查找栏。
- `tabManagerTransfer.test.ts`：跨窗口转移同一个 web view 与稳定标签 ID、最后一个内部标签回滚、重复 ID 拒绝并自动恢复源标签、目标挂载失败后归还注册表与源挂载、源 manager 销毁时作废在途转移。
- `findInPage.test.ts`：查找命令的精确边界校验（畸形/超长/NUL/扩展载荷拒绝）与状态机迁移——新查询开新会话、前后向续查、空查询清理与关栏保留选区、无活动查询时忽略续查命令、只接受最新 requestId 的结果。
- `zoomPreferences.test.ts`：缩放 origin 归一化（不透明/带凭据/非法/超长 URL 拒绝）、因子边界与两位小数取整、键值与重复 origin 清洗、按 origin 读写与重置删除、存储条数上限与最旧淘汰，以及 Chrome 档位步进。
- `appMenu.test.ts`：菜单锚点只接受有界整数坐标、工具栏目标走内部标签、活动 web 标签的 Chrome 式缩放命令、按 renderer 提供的锚点弹出。
- `credentialFormFiller.test.ts`：通过 input/change 事件填充账号密码且不提交表单，SPA 迟到字段的短暂重试与畸形载荷拒绝。
- `tabManagerWindowOpen.test.ts`：接管 Chromium 创建的原始 `webContents`、前后台标签、销毁竞态与不安全协议拒绝。
- `tabManagerLifecycle.test.ts`：关闭后右邻激活、B2 默认最后标签重置为内部 home、B3 浏览器生命周期下最后标签委托所属壳关闭、web/internal 恢复关闭栈、内部页原位转 web 和 16 标签满额通知。
- `browserLayout.test.ts`：验证主进程布局契约的 36/42/38/38/78 派生关系，以及 renderer CSS 变量注入。
- `tabSessionSnapshot.test.ts`：会话 exact-shape/版本/数量/ID/标题/内部页/活动项校验，HTTPS 与开发 loopback URL、敏感 query/hash、损坏/超限 JSON，以及序列化字段白名单和活动项邻位回退。
- `tabSessionStore.test.ts`：缺失与陈旧临时文件、严格恢复 fallback、快速保存合并，write/sync/close/rename 失败保旧，以及防抖 schedule、flush/dispose、在途最新快照和固定原因诊断恢复。
- `tabManagerSession.test.ts`：有序 web/internal 混合标签的稳定 ID/标题/活动项恢复、只挂载活动 web view、持久状态事件边界、精确快照字段、创建中途失败全回滚、新 ID 冲突规避，以及崩溃 view 替换创建失败后的标签保留和重试。
- `tabManagerHealth.test.ts`：活动/后台标签崩溃与无响应、38px NoticeBar 布局让位、继续等待与 responsive 清理、destroyed view 替换、原 URL 恢复和关闭后的迟到失败隔离。恢复失败一侧另覆盖重试加载失败时停转圈并只广播一次、同一 view 重复失败按幂等处理、`-3`（用户停止）与子框架失败不算恢复失败，以及 view 换掉之后迟到的失败不得把新 view 标成崩溃。
- `tabManagerFindZoom.test.ts`：查找 requestId/结果隔离、下载通知与查找条 bounds 累加、Chrome 缩放档位/写失败不生效，以及 `.user.js` 短期安装路由不进入会话快照。另覆盖切走标签页时关闭查找栏并撤掉旧页高亮、切回后不残留 38px，以及崩溃页拒绝开栏、后台标签页的查找命令被丢弃。
- `tabManagerNavigationGuard.test.ts`：`will-navigate` 与 `will-redirect` 参数化跑同一份期望（两个注册点共用一个闭包，只守住一个等于白名单形同虚设）。覆盖 `.user.js` 就地接管为内部确认页、无 registry 时阻断且页面保持原样、放行合法 HTTPS，以及 http/file/javascript/非法 URL 四种阻断各自的归因。
- `contextMenu.test.ts`：页面、壳内编辑区/Omnibox 与标签右键模板、用户脚本子菜单隔离及动作白名单。
- `tabSessionLifecycle.test.ts`：窗口关闭前 flush、重复关闭合并、无 persistence 直关，以及同步/异步失败和诊断异常不阻断关闭。

## 3. 运行方式

```powershell
cd algo-electron
npx vitest run tests/browser
npm run test:electron
```

## 4. 新增规则

修改 `electron/browser/ojBridge.ts`、`ojPreload.ts`、导航/权限/会话策略或 `setWindowOpenHandler` 接管流程时，在这里补测试。POST、OAuth 和 opener 等 Electron ABI 行为必须追加真实 startup smoke；会话 fixture 不得包含真实 URL 凭据、表单、密码、Cookie 或脚本源码。

`TabManager.ts` 里存在成对注册同一处理逻辑的事件（`will-navigate`/`will-redirect` 共用一个闭包，`did-navigate`/`did-navigate-in-page` 的守卫之后 14 行字节相同）。给这类事件写测试时用 `it.each` 参数化跑全部事件名，让一份期望同时约束所有孪生实现——只覆盖其中一个，将来单边修改不会被发现。

断言恢复/销毁类行为前先确认 test-double 的同步性：`MockWebContents.close()` 同步发 `destroyed`、`reload()` 默认同步发 `did-finish-load`，直接照真实 Electron 的异步时序写断言会得到假绿。需要观测失败路径时先覆盖掉对应方法（见 `tabManagerHealth.test.ts` 里的 `contents.reload = (() => undefined) as never`）。
