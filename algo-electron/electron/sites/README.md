# Sites 模块说明

## 1. 职责

`electron/sites/` 记录站点配置的架构边界。运行时站点配置已经收敛到 SQLite `site_configs` 与 `electron/db/repositories/site/`，本目录不再保存第二份内置配置或内存 registry。

本模块不实现题目解析、提交解析或实时 hook。代码级解析能力在 `electron/adapters/` 和 `electron/parsers/`。

Renderer 访问站点配置的 IPC 注册在 `electron/ipc/registerSitesIpc.ts`。站点模块只提供配置模型和内置清单，不直接注册 IPC。

## 2. 当前实现程度

DB seed 当前内置站点：

- Codeforces
- AcWing
- Nowcoder
- VJudge
- PTA
- Luogu
- LeetCode

`seedBuiltinSites()` 补齐七站的 domains、首页、题目/提交/login URL patterns、表单选择器、Cookie 策略和 adapter；用户启停状态不会被覆盖。

## 3. 文件职责

- `electron/db/repositories/site/types.ts`：唯一 `SiteConfigData` 类型与 DB row 映射。
- `electron/db/repositories/site/builtins.ts`：七站 seed。
- `electron/db/repositories/site/crud.ts`：运行时查询与用户配置 CRUD。
- `electron/credentials/autofill/autofillPolicy.ts`：消费 DB 登录配置，不维护站点副本。

## 4. SiteConfigData 字段

- `id`：站点唯一 id。
- `name`：展示名称。
- `domains`：匹配域名列表。
- `homeUrl`：站点首页。
- `enabled`：默认启用状态。
- `problemUrlPatterns`：题目 URL pattern。
- `submitUrlPatterns`：提交相关 URL pattern。
- `loginUrlPatterns`：登录页 URL pattern。
- `loginUsernameSelectors` / `loginPasswordSelectors`：隔离 preload 的受限表单选择器。
- `cookiePolicy`：Cookie 策略，当前包括 `session-only` 和 `vault-readable`。
- `adapter`：关联代码级 adapter id。

## 5. Repository 函数

- `getSiteById(id)`：按站点 id 查找。
- `getAllSites()`：返回全部站点。
- `getEnabledSites()`：返回启用站点。
- `seedBuiltinSites()`：插入缺失内置站点并补齐旧库空配置字段。

## 6. 边界规则

- 新增内置站点时只修改 DB seed，并同步 renderer 平台展示、adapter/parser；禁止恢复内存 `SiteRegistry` 或第二份内置配置。
- 站点配置是声明式信息，不要把复杂解析逻辑写到 `sites/`。
- Cookie 策略变更必须参考 `docs/ADR/ADR_0002_COOKIE_VAULT.md`。
- 提交监测策略以 `docs/DESIGN/SUBMISSION_MONITORING_DESIGN.md` 和 `electron/adapters/README.md` 为准。

## 7. 测试入口

站点规则由 parser 测试覆盖：

```powershell
cd algo-electron
node node_modules\vitest\vitest.mjs run tests\parsers\siteRules.test.ts tests\db\siteLoginAutofillMigration.test.ts
```
