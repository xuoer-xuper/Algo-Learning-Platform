# 安全与隐私政策

## 1. 适用范围

Algo Learning Platform 是本地优先桌面应用。安全与隐私边界重点包括：

- Electron 主进程、Preload、IPC 和远程 OJ 页面隔离。
- SQLite 本地数据库、migration 和 repository 写入路径。
- 持久登录态、CookieVault、站点 session 和浏览器缓存。
- 提交监测 hook、站点 adapter、用户脚本注入和诊断面板。
- AI 上下文导出、AI 输出保存和本地学习数据摘要。
- 打包产物、日志、截图、导入导出文件和测试 fixture。

## 2. 请不要提交的内容

提交 issue、PR、日志、截图或复现材料时，禁止包含：

- Cookie、session、csrf token、Authorization header 或可复用登录态。
- 用户源码、完整请求体、本机数据库文件内容或完整日志。
- 含隐私的绝对路径、账号敏感信息、远程账号密码或验证码。
- 可绕过站点风控、验证码或权限限制的操作细节。

如果需要说明提交监测问题，使用安全摘要：站点、公开题目 URL、最终 verdict、语言、提交 ID、诊断面板中的红acted 文本即可。

## 3. 报告安全问题

如果问题会导致本地数据泄漏、Cookie 泄漏、任意文件读写、远程页面越权访问本地能力、打包产物包含敏感文件，或 AI/导出链路泄漏隐私，请按以下方式报告：

1. 使用私下渠道联系维护者，不要公开粘贴敏感材料。
2. 说明影响范围、复现步骤和受影响版本。
3. 只提供已脱敏的日志、截图或最小复现。
4. 等待确认后再公开细节。

当前仓库未配置公开安全邮箱时，请先通过项目维护者约定的私有渠道发送脱敏摘要。

## 4. 不属于安全报告的场景

以下问题优先按普通 bug 或提交监测 issue 处理：

- 某个 OJ 登录过期、验证码、站点风控或比赛权限导致无法提交。
- 站点改版导致题目识别、verdict、语言、提交 ID 或 sourceUrl 解析错误。
- 本地 UI 错位、统计图缺失、笔记保存失败或用户脚本匹配错误。
- 未包含敏感数据的测试失败、构建失败或打包失败。

提交监测问题使用 `.github/ISSUE_TEMPLATE/submission_monitoring.yml`。

## 5. 开发安全要求

- Renderer 不直接访问 SQLite、Cookie、文件系统或 Electron session。
- Preload 只暴露白名单 API，不暴露通用 `ipcRenderer`。
- 远程 OJ 页面只能通过受控 bridge 上报有限 payload，不允许访问 Node、本地数据库或任意 IPC。
- Nowcoder、VJudge 等高风险站点不能使用通用 DOM verdict observer 作为实时入库来源。
- 数据库 schema 变化必须有 migration，并同步 `docs/DESIGN/DATABASE_SCHEMA.md` 和 `docs/OPERATIONS/DATABASE_MIGRATION_ROLLBACK.md`。
- Cookie、用户源码、完整请求体和可复用登录态不得进入日志、文档、测试 fixture、截图或 CI artifact。
- 站点凭据只允许主进程保存版本化 `electron-safe-storage` envelope；活动行必须 `sync_excluded=1`，软删除清空密文；renderer 不接收 envelope 或密码明文。
- B4.2 `CredentialVault` 只使用异步 `safeStorage` 加密/解密；壳 renderer 的凭据 IPC 仅返回脱敏摘要和删除结果，`getForAutofill` 明文出口保留在主进程，待 B4.3 接入受限 OJ preload。
- 普通 JSON 学习数据导出排除 `site_credentials`；需要完整本机恢复时使用数据库备份，并按敏感数据处理。
- migration 027 新增的用户脚本 values、资源缓存、host 授权与更新状态只由主进程 repository 访问，并随脚本外键级联删除；B6.2-B6.4 使用固定 frame preload、每导航 generation/nonce、脚本 revision、私有 MessagePort 和主进程网络代理替换 legacy `window.GM_*`/localStorage/page-fetch polyfill，`scripts:getAll` 只向 shell 返回无源码、无绝对路径的摘要。
- userscript 私有端口不得经 `window.postMessage` 交接给页面；主世界只获得闭包化 send/subscribe 函数。SPA 失配、脚本更新/禁用/删除或 generation 刷新必须同步中止网络请求、清理菜单、拒绝后续特权命令并使延迟 end/idle 回调失效。
- `@connect` 声明不等于已授权。`GM_xmlhttpRequest` 的初始 URL 与每一跳重定向都必须同时校验 HTTPS/开发 loopback、无 userinfo、当前脚本声明和当前脚本精确 host 持久授权；父域声明可以匹配子域，但授权只保存实际目标 host，跨 origin 跳转移除 Authorization。
- 用户脚本代理过滤 Cookie、Host、Origin、Referer、Content-Length、`Sec-*`、`Proxy-*` 等浏览器所有请求头，不返回 `Set-Cookie`，并限制请求体、响应体、响应头、超时、重定向及全局/单端口并发；OJ session 不再安装全局 CORS response rewriter。
- host 首次授权只通过所属完整壳的既有 NoticeBar 展示脚本名、目标 host 和来源 host；允许前必须复验 generation、webContents 和当前 owner，reload、标签过户、关窗及异步校验竞态均 fail closed。
- 打包产物不得包含 `tests/`、`tmp/`、`release/`、`.env`、本地数据库或 Cookie。

## 6. 验证入口

本地自动验证：

```powershell
cd algo-electron
npm run test:security
npm run test:all
```

`test:security` 检查 tracked 和未忽略的新增文件中是否存在 `.env`、本地数据库、日志文件，以及高置信 Cookie/header/token 明文模式。它不能替代人工安全审查和安装包内容验收。

提交监测、真实 OJ 登录态和安装包流程必须按 `docs/OPERATIONS/RELEASE_PROCESS.md` 人工验收。CI 不访问真实站点登录态，也不替代人工安全验收。
