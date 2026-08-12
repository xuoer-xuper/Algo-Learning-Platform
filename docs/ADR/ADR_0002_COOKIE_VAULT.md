# ADR-0002：CookieVault 作为本地一等能力

## 状态

已接受

## 背景

项目需要支持 Codeforces、AcWing、牛客、VJudge 等站点正常登录和提交。VJudge 的提交与同步场景可能需要读取 Cookie。项目定位是个人本地使用，不公开部署，因此可以在用户本机保存和读取必要 Cookie，但必须控制泄露风险。

## 决策

引入 `CookieVault` 模块，作为本地 Cookie 提取、保存和查询的统一入口。

Electron 持久 session 继续负责普通登录态。CookieVault 负责在需要时按站点读取 Cookie，并为 VJudge 提交、提交记录同步、平台同步提供能力。

## 规则

- Cookie 默认只保存在本地。
- Cookie 默认不参与同步。
- Cookie 默认不进入 JSON 导出。
- Cookie 值不写入普通日志。
- Renderer 不直接读取 Cookie。
- UI 默认只展示 Cookie 存在状态、站点、过期时间、用途摘要。

## 影响

正面影响：

- 支持 VJudge 等需要 Cookie 的长期能力。
- Cookie 使用路径统一，便于审计。
- 避免各模块私自读取 Cookie。

代价：

- 需要设计本地敏感数据存储策略。
- 需要在文档和代码里持续防止泄露。

## 后续待定

- Cookie 值是否写入 SQLite。
- Cookie 值是否使用系统凭据保护或加密。
- 是否提供用户手动清理 CookieVault 的 UI。

