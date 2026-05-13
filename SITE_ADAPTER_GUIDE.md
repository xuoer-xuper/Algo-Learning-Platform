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

Phase 5 开始支持。

PTA 初期适配策略：

- 先通过配置匹配常见题目 URL。
- 能识别题目 ID 即可。
- 不强制抓取全部元数据。
- 文档记录无法适配的页面类型。

## 6. 新增站点流程

1. 在站点管理页或内置配置中添加 SiteConfig。
2. 添加至少 3 个有效 URL 样例。
3. 添加至少 3 个无效 URL 样例。
4. 实现 URL 解析。
5. 输出 ProblemIdentity。
6. 验证不会误识别首页、列表页、提交页。
7. 更新本文档。
8. 更新 `TASKS.md` 和 `AI_HANDOFF.md`。

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

