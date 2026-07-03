# Cookies 模块说明

## 1. 职责

`electron/cookies/` 是 OJ 登录态读取边界，负责从 Electron 持久 session 中按域名或 URL 读取 Cookie。

本模块不持久化 Cookie 副本，不打印 Cookie 值，不改变 Cookie 策略。安全边界以 `docs/adr/0002-cookie-vault.md` 为准。

## 2. 当前实现程度

当前只有 `CookieVault.ts`：

- 使用 session partition：`persist:oj-main`。
- 支持按 domain 读取 Cookie。
- 支持按 URL 读取 Cookie。
- 支持只读取 Cookie 名称。
- 支持按候选 Cookie 名判断站点是否存在登录态。

## 3. 类与函数

`CookieVault`：

- `getCookiesByDomain(domain)`：返回指定 domain 下的 Cookie 对象。
- `getCookiesForUrl(url)`：返回指定 URL 可用的 Cookie 对象。
- `getCookieNamesByDomain(domain)`：只返回 Cookie 名称，用于诊断或登录态检测。
- `hasSessionCookie(domain, sessionCookieNames)`：判断是否存在任一会话 Cookie 名。

## 4. 安全规则

- 不在普通日志中输出 Cookie 值。
- 不把 Cookie 写入提交监测 payload。
- 不新增跨站点 Cookie 汇总接口。
- 只有明确需要登录态的同步能力才应依赖本模块。
- 改动前先读 `docs/adr/0002-cookie-vault.md`。

## 5. 测试入口

CookieVault 依赖 Electron session，当前没有纯单元测试。修改后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及登录态行为时还需要手测对应 OJ 登录保持和同步流程。
