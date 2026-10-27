# Userscript 烟测失效竞态——诊断记录

## 现象

CI(Electron and renderer smoke)间歇失败于 `Userscript runtime Electron smoke`,
断言 `/race` 场景事件序列时实际值多出一项 `v1-end`:

```
actual:   ['v1-start', 'inline-before-hold', 'page-script', 'v1-end']
expected: ['v1-start', 'inline-before-hold', 'page-script']
```

本地复现率约 1/4(4 跑 1 挂);CI 2026-10-26 run 40309434557 同签名失败。

## 竞态链路

`userScriptRuntimeSmoke.test.ts` 的"延迟文档失效"阶段(`tests/electron/userScriptRuntimeSmoke.test.ts:225-243`):

1. `/race` 页面被服务器扣住 hold.js 响应,文档停在加载中,v1 的 document-end 脚本尚未运行。
2. 测试在主进程同一个同步块里先后执行:
   - `runtime.advanceGeneration()` → 桥接层 `closeAllPorts()` → 向渲染进程
     `postMessage({type:'runtime:invalidate'})`(`electron/scripts/userScriptRuntimeBridge.ts:146,185`)——**异步**送达;
   - `heldScriptResponse.end(...)` → hold.js 响应恢复 → 渲染进程解析继续 → document-end 触发。
3. 渲染进程主世界 runtime 收到 invalidate 后置 `lifecycle.status='invalid'` 并清空 end/idle 队列
   (`electron/scripts/userScriptMainWorldRuntime.ts:770-775`),但若 **网络路径先于 MessagePort 消息**到达,
   v1-end 尚未注销即被执行 → 断言多出一项。

## 实验

`advanceGeneration()` 与释放 hold 之间插入 100ms 延迟:5/5 全绿(不插时 1/4 挂)。
竞态假设实锤;盲延迟只是概率缓解。

## 修复方案(最终实施)

### 真根因(实现标记方案后被烟测暴露)

最初判断"消息与 DOMContentLoaded 的投递竞态"只对了一半。烟测以确定性等待替换竞态后,
5/5 稳定挂起,暴露出更深的根因:

`advanceGeneration()` 可能发生在帧端口仍处 **pending** 阶段(INIT 握手已拿到导航快照,
但 MessagePort 尚未到达主进程)。此时桥接层的 `closeAllPorts()` 对 pending 记录是
**静默 clear**——不发失效;等端口真正到达时,`handlePort` 又因代际不匹配走 `reject()`
静默关闭。两条路都不给旧运行时任何通知 → gen-1 的 document-end 脚本在失效"永远缺席"
下照常执行 → 原始 CI 的 `v1-end` 泄漏。这解释了偶发率(端口激活通常先于代际前进,
偶尔落后)与本地 3/4 挂、CI 同签名的全部现象。

### 实施内容

1. **根因修复(electron/scripts/userScriptRuntimeBridge.ts)**
   - 代际前进路径改用 `invalidateAllPorts()`:失效所有活动端口,但**保留 pending 记录**。
   - `handlePort` 拒绝路径:若拒绝源于代际不匹配,先向陈旧端口补发
     `runtime:invalidate` 再关闭——已启动的旧运行时保证收到失效通知。
2. **确定性同步(烟测 + 运行时)**
   - `userScriptMainWorldRuntime.ts`:BuildInput/ExecutionPayload 增加可选
     `exposeInvalidationMarker`;invalidate 处理器在该标记开启时向页面 globalThis 写
     `__algoUserScriptRuntimeInvalidated = <generation>`;生产不传,零副作用。
   - `userScriptCompiledCatalog.ts` / `userScriptRuntimeBridge.ts`:选项透传。
   - `userScriptRuntimeSmoke.test.ts`:bridge 开启标记;/race 页面内联脚本(与运行时
     同属主世界)在被 hold 期间轮询标记,以 `console-message` 通知主进程;主进程收到
     信号后才释放 hold。
   - 关键教训:文档加载完成前 `webContents.executeJavaScript` 不会求值,且 `waitFor`
     的 `await predicate()` 若永不落定,其自带超时也永远走不到——加载期可观测只能走
     console-message。

## 验证

- `pnpm run typecheck` / `lint` 全绿;`test:unit` 1387/1387(新增 3 个用例)。
- `pnpm run test:electron` 连续 5 次全 PASS(修复前:原始竞态 1/4 挂;
  仅标记方案时 5/5 挂——正是它暴露了 pending 丢弃)。

## 关联

- 2.0.0 修复线并入工具门分支(bbe23ef)后首现 CI 红;根因是既有缺陷,非合并引入。
