# Script Tests

## 1. 职责

`tests/scripts/` 覆盖用户脚本 metadata、匹配规则、主世界运行器、主进程缓存与端口桥，不启动真实 Electron 窗口。

## 2. 当前覆盖

- `userScriptMetadata.test.ts`：覆盖 B6.1 完整 metadata、严格 scheme/host/path、host 锚定、query/hash、path 大小写、非法 match fail closed、include glob/regex flags 与 exclude 优先级。
- `userScriptService.test.ts`：覆盖显式站点绑定权威范围、exclude 优先、空绑定 metadata fallback、未知/禁用站点和坏 JSON fail closed，以及文件/数据库源码等价读取。
- `userScriptResourceCache.test.ts`：覆盖 sha256/md5 最后受支持 hash、hex/base64url 归一化、HTTPS/重定向/大小限制、声明顺序、重复名称与 SRI mismatch fail closed。
- `userScriptRemoteInstaller.test.ts`：覆盖远程脚本/资源预下载、安全预览、重定向拒绝、非 userscript 内容、暂存消费和 TTL 清理。
- `userScriptUpdateService.test.ts`：覆盖 ETag/Last-Modified 条件请求、304、updateURL→downloadURL 回退、严格 newer、身份漂移拒绝和 24 小时到期跳过。
- `userScriptImport.test.ts`：覆盖精确身份、版本比较、Windows 安全文件名、重复 metadata 指令收敛、local 副本 namespace 改写，以及持久化失败的临时文件清理。
- `userScriptMainWorldRuntime.test.ts`：覆盖独立 IIFE、语法错误隔离、classic/modern grant 裁剪、`@grant none`、值快照、缓存资源 text/data URL API、网络 classic callback/modern Promise+abort、剪贴板、菜单、onurlchange，以及 start/end/idle、SPA sync、inactive 收权和 revision 去重；document-start/end 可在主世界 runtime ready 前按页面阶段安全排队。
- `userScriptRuntime.test.ts`：覆盖启动水合、frame/noframes、按脚本 ID 的值隔离、`@require` 顺序拼接、资源快照、缓存漂移拒绝、稳定 revision 和 generation 刷新。
- `userScriptRuntimeProtocol.test.ts`：覆盖握手、generation 端口请求、runtime phase/sync/invalidate、value mutation 与网络/剪贴板/菜单 command 的 exact-shape、大小、类型和 JSON 安全边界。
- `userScriptRuntimeBridge.test.ts`：使用 Electron test-double 覆盖固定 frame preload、OJ sender/session/frame 校验、nonce/generation、真实 frame load idle 事件、SPA 重匹配/inactive 收权、`@grant none`、网络/剪贴板/菜单路由和 stale port 响应拒绝。
- `userScriptConnectPolicy.test.ts`：覆盖 HTTPS/开发 loopback、userinfo 拒绝、`self`/父域/通配声明和欺骗性 hostname 后缀。
- `userScriptNetworkProxy.test.ts`：覆盖逐跳授权、敏感 header 过滤、跨 origin 凭据剥离、超时/中止、16 MiB 响应限制、单端口并发和 userinfo/未声明重定向拒绝。
- `userScriptHostPermissionBroker.test.ts`：覆盖窗口队列、同 host 合并、安全提示字段、持久化/验证失败、拒绝负缓存、超时、generation/窗口清理与异步校验竞态。
- `userScriptMenuRegistry.test.ts`：覆盖 webContents/端口隔离、重复命令更新、注册上限与清理。
- `userscriptBootstrapPreloadModule.test.ts`：模块级执行 `electron/scripts/userscriptBootstrapPreload.ts`（jsdom）。覆盖"要不要把特权运行时装进这一帧"的全部判断——非 http(s) 源与超长 frameUrl 压根不握手、`ok:false`/nonce 不匹配/generation 与 scripts 形状不对不装桥、catalog generation 对不上或主世界执行抛错时不交出 MessagePort 且主世界不残留桥对象——以及数据边界（只有 `id/revision/values` 过 IPC，脚本正文从主世界 catalog 按 `id\0revision` 取回，revision 对不上就丢）和桥的两个闭包真的接在交给主进程的那个 port 上。`userScriptRuntimeSmoke.test.ts` 验的是打包后能在真页面跑起来，这里补的是它造不出来的拒绝与清理分支。

## 3. 运行方式

```powershell
cd algo-electron
npm exec vitest -- run tests/scripts
```

## 4. 新增规则

修改用户脚本 metadata、站点匹配、grant/API、值快照或端口协议时补这里。测试 fixture 不应包含真实用户脚本源码、Cookie、token 或登录态。
