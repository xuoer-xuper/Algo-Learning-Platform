# Built-in Site Configs

## 1. 职责

`electron/sites/builtins/` 保存内置 OJ 站点配置。这里定义站点 id、名称、域名、首页、是否启用、问题 URL pattern 和可选能力标记。

本目录不实现题目解析、提交解析、实时 hook 或数据库写入；这些能力分别属于 `electron/adapters/`、`electron/submissions/` 和 repository。

## 2. 当前实现程度

当前内置配置：

- `codeforces.ts`
- `acwing.ts`
- `nowcoder.ts`
- `vjudge.ts`
- `pta.ts`
- `luogu.ts`
- `leetcode.ts`

这些配置由 `electron/sites/index.ts` 汇总，并通过 `siteRepository.seedBuiltinSites()` 写入或更新本地站点配置。

## 3. 配置规则

- `id` 必须稳定，不能随显示名变化。
- `domains` 覆盖站点主域名和必要子域名。
- `homeUrl` 是导航入口，不等于题目 canonical URL。
- `problemUrlPatterns` 用于自定义/兼容 parser，不替代 adapter 的精确解析。
- 默认启用状态变更会影响用户新库 seed；已有用户库以 repository 更新逻辑为准。

## 4. 边界规则

- 新增站点时必须同步 adapter、parser/站点规则测试、`docs/DESIGN/SITE_ADAPTER_GUIDE.md` 和文档索引。
- 不在配置中存放 Cookie、账号、token 或用户源码。
- 不把站点专用解析正则散落到 renderer。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\parsers\siteRules.test.ts
```
