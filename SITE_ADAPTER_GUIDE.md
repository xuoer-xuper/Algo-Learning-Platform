# 站点适配指南（SITE_ADAPTER_GUIDE）

## 1. 目标

本项目需要长期支持不同刷题网站。Phase 1 内置 Codeforces、AcWing、牛客、VJudge；后续需要支持 PTA 和用户手动新增站点。

站点适配必须做到：

- 优先配置化。
- 可测试。
- 不误识别。
- 不污染核心题库数据。
- 能被 AI Agent 独立接手。

## 2. 站点适配层级

优先级从低成本到高能力：

1. SiteConfig：通过域名和 URL 规则识别。
2. Parser Adapter：用代码解析复杂 URL。
3. Metadata Extractor：页面加载后抓取标题、难度、标签。
4. Submission Sync Adapter：同步提交记录。

不要为了一个简单 URL 规则直接写复杂 adapter。

## 3. SiteConfig 字段

```ts
type SiteConfig = {
  id: string
  name: string
  domains: string[]
  homeUrl: string
  enabled: boolean
  problemUrlPatterns: string[]
  submitUrlPatterns?: string[]
  cookiePolicy?: 'session-only' | 'vault-readable'
  adapter?: string
  isBuiltin: boolean
}
```

字段说明：

- `id`：稳定唯一，不要随便改。
- `name`：UI 展示名。
- `domains`：用于站点匹配。
- `homeUrl`：导航默认入口。
- `enabled`：是否参与识别。
- `problemUrlPatterns`：题目 URL 规则。
- `submitUrlPatterns`：提交相关 URL 规则。
- `cookiePolicy`：是否允许 CookieVault 读取。
- `adapter`：复杂站点使用的专用解析器。
- `isBuiltin`：是否内置站点。

## 4. ProblemIdentity

所有站点最终输出统一结构：

```ts
type ProblemIdentity = {
  platform: string
  platformProblemId: string
  canonicalUrl: string
  contestId?: string
  problemIndex?: string
  sourcePlatform?: string
  sourceProblemId?: string
  confidence: 'url' | 'content' | 'manual'
}
```

规则：

- `platform` 使用 site id。
- `platformProblemId` 必须稳定。
- `canonicalUrl` 必须去除无意义 query。
- VJudge 需要尽量补充 `sourcePlatform` 和 `sourceProblemId`。
- 不确定时不要写入核心题库。

## 5. 内置站点 URL 规则

### 5.1 Codeforces

需要支持：

- `https://codeforces.com/problemset/problem/{contestId}/{index}`
- `https://codeforces.com/contest/{contestId}/problem/{index}`
- `https://codeforces.com/gym/{contestId}/problem/{index}`

建议 ID：

```text
{contestId}{index}
```

canonical URL 必须保留路径类型，禁止全部写成 `/contest/`：

- problemset：`https://codeforces.com/problemset/problem/{contestId}/{index}`
- 正式比赛：`https://codeforces.com/contest/{contestId}/problem/{index}`
- gym：`https://codeforces.com/gym/{contestId}/problem/{index}`

gym 或 API 同步题目若误用 `/contest/` 会触发 Codeforces 页面报错 `Illegal contest ID`。API 导入默认使用 problemset 链接。

附件页、提交页等非单题路径（如 `/gym/{id}/attachments`）导航时应解析为 gym/contest 主页：`https://codeforces.com/gym/{id}`。

### 5.2 AcWing

需要支持：

- `https://www.acwing.com/problem/content/{id}/`
- `https://www.acwing.com/problem/content/description/{id}/`

建议 ID：

```text
{id}
```

### 5.3 牛客

需要支持：

- `https://www.nowcoder.com/practice/{uuid}`
- `https://www.nowcoder.com/questionTerminal/{uuid}`
- `https://ac.nowcoder.com/acm/problem/{id}`
- `https://ac.nowcoder.com/acm/contest/{contestId}/{problem}`

建议 ID：

```text
practice:{uuid}
question:{uuid}
problem:{id}
contest:{contestId}:{problem}
```

### 5.4 VJudge

需要支持：

- `https://vjudge.net/problem/{OJ}-{problemId}`
- `https://vjudge.net/contest/{contestId}#problem/{index}`

建议 ID：

```text
problem:{OJ}:{problemId}
contest:{contestId}:{index}
```

VJudge 特别规则：

- VJudge 本身是平台。
- 原始 OJ 和原始题号写入 `sourcePlatform`、`sourceProblemId`。
- Contest 页面可能需要页面内容抓取才能补全原始题目。

### 5.5 PTA

Phase 5 已完成基础适配。

PTA 适配策略：

- URL 识别：支持练习题目页和考试题目页。
- 标题抓取：多策略降级（专用选择器 → h3 → document.title），Angular SPA 需要更长等待时间（7s 额外延迟）。
- 提交同步：DOM 表格抓取，支持评测结果、编译器、耗时、内存、分数列。
- 不强制抓取全部元数据。
- 文档记录无法适配的页面类型。

已支持的 URL 模式：

- `https://pintia.cn/problem-sets/{setId}/problems/{problemId}` — 练习题目页
- `https://pintia.cn/problem-sets/{setId}/exam/problems/{problemId}` — 考试题目页
- `https://pintia.cn/problem-sets/{setId}/exam/problems/type/7?problemSetProblemId={id}` — 考试题目页（带类型参数）

ID 格式：`{setId}-{problemId}`

PTA 适配限制：

- PTA 题目 URL 需要登录才能查看内容，标题抓取依赖登录态。
- PTA 题集（problem-sets）列表页和 dashboard 不是单题页面，不应识别为题目。
- PTA 是 Angular SPA，DOM 渲染延迟较大，标题抓取需要 7s 额外延迟。
- PTA 考试页面（exam-problems）结构与练习页面不同，已分别适配。
- PTA 提交记录通过 DOM 表格抓取，需要在提交记录页面操作。

## 6. 新增站点流程

1. 在站点管理页或内置配置中添加 SiteConfig。
2. 添加至少 3 个有效 URL 样例。
3. 添加至少 3 个无效 URL 样例。
4. 实现 URL 解析。
5. 输出 ProblemIdentity。
6. 验证不会误识别首页、列表页、提交页。
7. 更新本文档。
8. 更新 `TASKS.md` 和 `AI_HANDOFF.md`。

### 6.1 新增 SiteAdapter 适配器步骤

对于使用简单配置（`problemUrlPatterns`）无法解决的复杂平台，可以通过实现代码级 `SiteAdapter` 接口进行扩展：

1. **定义 Adapter 接口实现**：
   在 `electron/parsers/types.ts` 中已定义 `SiteAdapter` 接口：
   ```ts
   export interface SiteAdapter {
     id: string
     match?(url: string): boolean
     parse?(url: string): ProblemIdentity | null
     extractTitleScript?(): string
   }
   ```

2. **编写 Adapter 逻辑**：
   创建一个独立的适配器实现，例如：
   ```ts
   // electron/parsers/sites/mycustom.ts
   import type { SiteAdapter } from '../types'
   
   export const myCustomAdapter: SiteAdapter = {
     id: 'mycustom',
     match(url) {
       return url.includes('mycustom.com/problem')
     },
     parse(url) {
       // 自定义复杂解析逻辑
       return { platform: 'mycustom', ... }
     },
     extractTitleScript() {
       return `(() => document.querySelector('.custom-title')?.textContent)()`
     }
   }
   ```

3. **注册 Adapter**：
   在 `electron/parsers/registry.ts` 中引入并注册：
   ```ts
   import { myCustomAdapter } from './sites/mycustom'
   registerAdapter(myCustomAdapter)
   ```

4. **配置站点关联**：
   在内置站点配置或用户自定义配置中，指定 `adapter` 字段为该适配器的 `id`（例如：`adapter: 'mycustom'`）。
   当用户访问匹配域名的 URL 时，系统会自动调用该 Adapter 的解析和标题抓取逻辑。

## 7. 测试要求

每个站点至少测试：

- 有效题目 URL。
- 带 query 的题目 URL。
- 带 hash 的题目 URL。
- 首页。
- 题目列表页。
- 提交页。
- 不相关域名。

测试不应依赖网络。

## 8. Cookie 策略

站点配置中必须明确 Cookie 策略：

- `session-only`：只依赖 Electron session，不提供 CookieVault 查询。
- `vault-readable`：允许 CookieVault 读取，用于提交同步或 VJudge 等需求。

默认策略应保守。VJudge 可以使用 `vault-readable`。

## 9. 页面抓取规则

页面元数据抓取只在以下条件满足时执行：

- 站点已启用。
- URL 已识别为题目页。
- 页面加载完成。
- 抓取器属于白名单 adapter。

抓取失败原则：

- 不影响题目记录。
- 写入诊断事件。
- 不覆盖已有可靠字段为空值。

## 10. 不允许的适配方式

禁止：

- 通过模糊字符串把大量页面误识别为题目。
- 在 Renderer 中写核心 URL parser。
- 为了一个站点在 `main.ts` 里写专用逻辑。
- 把 Cookie 明文写入调试日志。
- 抓取失败就删除题目。

## 11. VJudge Contest 映射说明

VJudge 的比赛（contest）与原始 OJ 题目存在映射关系：

- VJudge 题目 ID 格式：`{OJ}-{problemId}`（如 `Codeforces-123A`）
- VJudge contest 题目 URL：`vjudge.net/contest/{contestId}#problem/{letter}`
- VJudge contest 提交页：`vjudge.net/contest/{contestId}#status/{username}/{letter}/{result}`

当前实现：

- VJudge 题目 URL 识别为 `contest-{contestId}-{letter}` 格式。
- VJudge 提交页从 URL hash 提取题号字母。
- VJudge 全局状态页从 hash 提取 OJ 和题号。

未来扩展：

- contest_results 表可用于记录 VJudge 比赛结果。
- rating_history 表可用于记录 VJudge Rating 变化（如果 VJudge 有 Rating 系统）。
- VJudge contest 与原始 OJ 比赛的映射可通过 contest_id + source_platform 建立。

