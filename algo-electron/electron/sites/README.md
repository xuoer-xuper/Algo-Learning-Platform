# Sites 模块说明

## 1. 职责

`electron/sites/` 存放站点配置模型和内置站点清单。它描述站点是否启用、域名、首页、题目 URL pattern、提交 URL pattern 和 Cookie 策略。

本模块不实现题目解析、提交解析或实时 hook。代码级解析能力在 `electron/adapters/` 和 `electron/parsers/`。

Renderer 访问站点配置的 IPC 注册在 `electron/ipc/registerSitesIpc.ts`。站点模块只提供配置模型和内置清单，不直接注册 IPC。

## 2. 当前实现程度

已内置站点：

- Codeforces
- AcWing
- Nowcoder
- VJudge
- PTA
- Luogu
- LeetCode

`SiteRegistry` 在构造时加载这些内置配置，并提供按 id、domain、启用状态查询。

## 3. 文件职责

- `types.ts`
  - `SiteConfig`：站点配置结构。
- `siteRegistry.ts`
  - `SiteRegistry`：内存站点注册表。
- `builtins/*.ts`
  - 各平台内置 `SiteConfig`。

## 4. SiteConfig 字段

- `id`：站点唯一 id。
- `name`：展示名称。
- `domains`：匹配域名列表。
- `homeUrl`：站点首页。
- `enabled`：默认启用状态。
- `problemUrlPatterns`：题目 URL pattern。
- `submitUrlPatterns`：提交相关 URL pattern。
- `cookiePolicy`：Cookie 策略，当前包括 `session-only` 和 `vault-readable`。
- `adapter`：关联代码级 adapter id。

## 5. SiteRegistry 函数

- `getById(id)`：按站点 id 查找。
- `getByDomain(domain)`：按域名查找启用站点。
- `getAll()`：返回所有内置站点。
- `getEnabled()`：返回启用站点。

## 6. 边界规则

- 新增站点时需要同步 `builtins/`、数据库种子、renderer 平台展示、adapter/parser。
- 站点配置是声明式信息，不要把复杂解析逻辑写到 `sites/`。
- Cookie 策略变更必须参考 `docs/ADR/ADR_0002_COOKIE_VAULT.md`。
- 提交监测策略以 `docs/DESIGN/SUBMISSION_MONITORING_DESIGN.md` 和 `electron/adapters/README.md` 为准。

## 7. 测试入口

站点规则由 parser 测试覆盖：

```powershell
cd algo-electron
node node_modules\esbuild\bin\esbuild tests\parsers\siteRules.test.ts --bundle --platform=node --format=esm --outfile=tmp\parsers-siteRules.test.mjs
node tmp\parsers-siteRules.test.mjs
```
