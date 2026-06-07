# 站点适配指南（SITE_ADAPTER_GUIDE）

## 1. 目标

本项目需要长期支持不同刷题网站。已内置 Codeforces、AcWing、牛客、VJudge、PTA、洛谷；后续可由用户手动新增站点。

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

### 5.6 洛谷

已完成适配。

洛谷适配策略：

- URL 识别：题目页 `/problem/{pid}`（如 P1014、B2005、CF1A 等）。
- 标题抓取：从 `document.title` 提取，自动剥离题号前缀（如 `P1055`）和方括号标签（如 `[NOIP 2008 普及组]`），只保留纯题目名。
- 提交同步：优先使用 `_contentOnly=1` API 获取鲜活 JSON 数据，降级到 `window._feInjection`，再降级到 DOM 抓取。
- 评测状态码映射：洛谷使用数字状态码（12=AC, 6/14=WA, 5=TLE, 4=MLE, 3=OLE, 7=RE, 2=CE, 0/1=TESTING）。

已支持的 URL 模式：

- `https://www.luogu.com.cn/problem/{pid}` — 题目页

ID 格式：`{pid}`（如 P1014、B2005）

洛谷适配中的关键教训（**务必参考**）：

- 洛谷是 Vue SPA，`window._feInjection` 只包含首次服务端渲染时的数据。用户在页面内切换筛选条件或翻页后，该变量中的数据**已过期**，不能直接使用。必须通过 `_contentOnly=1` 参数重新 fetch 当前 URL 对应的最新数据。
- `extractTitleScript()` 返回的脚本运行在浏览器上下文中（`executeScript`），其中的模板字符串反引号 `` ` `` 和 `${}` 是 **JavaScript 原生语法**，不要加反斜杠转义。
- 洛谷题目标题格式为 `P1055 [NOIP 2008 普及组] ISBN 号码`，需要用正则剥离前缀和标签，只保留末尾的纯题目名。

## 6. 新增站点完整流程（Checklist）

> [!IMPORTANT]
> 新增一个 OJ 平台不仅仅是写后端解析器。必须完成以下**全部步骤**，否则用户会发现"侧边栏没有、首页没有、全部平台没有"。

### 6.1 后端层（electron/）

1. **站点配置**：在 `electron/sites/builtins/` 创建 `{id}.ts`，导出 `SiteConfig` 对象，并在 `electron/sites/siteRegistry.ts` 注册。
2. **URL 解析器**：在 `electron/parsers/sites/` 创建 `{id}.ts`，实现 `SiteAdapter` 接口（`match`, `parse`, `extractTitleScript`），并在 `electron/parsers/registry.ts` 注册。
3. **提交抓取器**：在 `electron/submissions/scrapers/domScraper.ts` 的 `scrapeCurrentPage()` 添加域名判断分发，并实现 `scrape{Name}()` 函数。
4. **同步服务关联**：在 `electron/submissions/syncService.ts` 中：
   - `syncCurrentPage()` 里添加该平台的特殊 URL 解析逻辑（如从 URL 参数提取 `pageProblemId`）。
   - `syncCurrentPage()` 里添加从 `rawJson` 提取 `_xxxProblemId` 的逻辑（将题号从抓取数据透传到写入层）。
   - `writeSubmissions()` 里添加**逐行关联**逻辑（从每条提交的 `rawJson` 读取题号，自动创建题目并关联）。
5. **测试**：在 `tests/parsers/siteRules.test.ts` 中添加 URL 解析测试（至少 3 个有效 + 3 个无效 URL）。

### 6.2 前端层（src/）— **不可遗漏！**

以下文件中都有**硬编码的平台注册表常量**，必须逐一添加新平台：

| 文件 | 需要添加的常量 |
|------|--------------|
| `src/features/home/HomePage.tsx` | `PLATFORM_NAMES`、`PLATFORM_URLS`、`PLATFORM_COLORS` |
| `src/features/analytics/Dashboard.tsx` | `PLATFORM_NAMES`，以及 `COLORS` 数组确保颜色足够 |
| `src/features/problems/ProblemDetail.tsx` | `PLATFORM_NAMES` |
| `src/features/problems/ProblemSidebar.tsx` | `PLATFORM_LABELS`（简写如 CF/LG），以及 `<option>` 下拉选项 |
| `src/features/settings/SettingsPage.tsx` | `PLATFORM_NAMES`，以及抓取提示文本中补充平台名 |

各平台的参考配置值：

```ts
// PLATFORM_NAMES 示例
{ codeforces: 'Codeforces', acwing: 'AcWing', nowcoder: '牛客', vjudge: 'VJudge', pta: 'PTA', luogu: '洛谷' }

// PLATFORM_LABELS 示例（侧边栏简写）
{ codeforces: 'CF', acwing: 'AcW', nowcoder: 'NC', vjudge: 'VJ', pta: 'PTA', luogu: 'LG' }

// PLATFORM_URLS 示例
{ codeforces: 'https://codeforces.com', acwing: 'https://www.acwing.com', ... }

// PLATFORM_COLORS 示例
{ codeforces: '#1da1f2', acwing: '#00a0e9', nowcoder: '#ff6a00', vjudge: '#4caf50', pta: '#8e24aa', luogu: '#3498db' }
```

### 6.3 文档更新

- 更新本文档（`SITE_ADAPTER_GUIDE.md`）：添加新站点的 URL 规则、ID 格式、适配策略和注意事项。
- 更新 `TASKS.md` 和 `AI_HANDOFF.md`（如适用）。

## 7. SiteAdapter 接口与实现规范

### 7.1 接口定义

```ts
export interface SiteAdapter {
  id: string
  match?(url: string): boolean
  parse?(url: string): ProblemIdentity | null
  extractTitleScript?(): string
}
```

### 7.2 编写 Adapter 逻辑

创建独立的适配器文件：

```ts
// electron/parsers/sites/{id}.ts
import type { SiteAdapter } from '../types'
import type { ProblemIdentity } from '../../shared/types'

export const myAdapter: SiteAdapter = {
  id: 'mysite',

  match(url) {
    try {
      const u = new URL(url)
      return u.hostname === 'mysite.com' || u.hostname === 'www.mysite.com'
    } catch { return false }
  },

  parse(url) {
    // 解析出题号，构建 ProblemIdentity
    return { platform: 'mysite', platformProblemId: '...', canonicalUrl: '...', confidence: 'url' }
  },

  extractTitleScript() {
    // 注意：这段代码在浏览器 executeScript 中运行
    // 模板字符串 ` 和 ${} 是原生 JS 语法，不要加反斜杠
    return `(() => {
      return document.querySelector('h1')?.textContent?.trim() || document.title;
    })()`
  }
}
```

### 7.3 注册 Adapter

在 `electron/parsers/registry.ts` 中引入并注册：

```ts
import { myAdapter } from './sites/mysite'
registerAdapter(myAdapter)
```

### 7.4 配置站点关联

在 `electron/sites/builtins/{id}.ts` 中，指定 `adapter` 字段为该适配器的 `id`。

## 8. 提交抓取器编写规范

### 8.1 SPA 站点的数据获取陷阱

> [!CAUTION]
> 现代 OJ 普遍使用 SPA 框架（Vue/React/Angular）。在 SPA 中，页面内切换路由/筛选条件后，**服务端注入的初始数据已经过期**。直接读取注入变量（如 `window._feInjection`、`window.__NEXT_DATA__`）会抓到**错误的数据**。

正确的抓取优先级：

1. **优先发起 API 请求**：在 `executeScript` 中通过 `fetch()` 调用当前 URL 对应的 JSON 接口（如洛谷的 `?_contentOnly=1`），获取最新鲜的数据。
2. **降级到注入变量**：只有在 API 请求失败时，才尝试读取 `window._feInjection` 等全局变量。
3. **最终降级到 DOM**：如果连注入变量也不可用，再走传统的 DOM 选择器抓取。

示例（洛谷抓取策略）：

```ts
const data = await browserHost.executeScript(`
  (async () => {
    // 1. 优先 fetch 当前 URL 的 JSON 数据
    try {
      const u = new URL(location.href);
      u.searchParams.set('_contentOnly', '1');
      const res = await fetch(u.toString());
      if (res.ok) {
        const json = await res.json();
        const result = json?.currentData?.records?.result;
        if (result && Array.isArray(result)) {
          return { fromApi: true, records: result };
        }
      }
    } catch(e) {}

    // 2. 降级到注入变量
    try {
      const result = window._feInjection?.currentData?.records?.result;
      if (result && Array.isArray(result)) {
        return { fromApi: true, records: result };
      }
    } catch(e) {}

    // 3. 最终降级到 DOM 抓取
    const rows = [];
    // ... DOM 选择器逻辑
    return { fromApi: false, rows };
  })()
`)
```

### 8.2 executeScript 中的字符串陷阱

> [!WARNING]
> `executeScript(code)` 的参数是一个**字符串**，它会在浏览器的 WebContents 中执行。当你在 TypeScript 源码里用模板字符串构造这段代码时，要注意：
> - 脚本内部的反引号 `` ` `` 和 `${}` 是 JavaScript 语法本身，**不需要反斜杠转义**。
> - 如果你的 TypeScript 代码使用模板字符串包裹整段脚本，脚本内部应使用普通字符串引号 `'` 或 `"`，或者直接用原生模板字符串。
> - **常见错误**：写成 `` \`https://...\${id}\` `` 会产生语法错误 `Invalid character`。

### 8.3 题目关联机制（rawJson 透传）

在抓取提交记录时，每条记录关联的题目 ID 应通过 `rawJson` 字段透传：

1. **抓取器**（`domScraper.ts`）：将题号写入 `rawJson`，使用约定前缀 `_{platform}ProblemId`：
   ```ts
   rawJson: r.problem?.pid ? JSON.stringify({ _luoguProblemId: r.problem.pid }) : undefined
   ```

2. **同步服务**（`syncService.ts`）：
   - 在 `syncCurrentPage()` 中，从 `rawJson` 提取题号并挂载到提交对象上。
   - 在 `writeSubmissions()` 中，实现逐行关联：从每条提交读取 `_xxxProblemId`，自动 upsert 题目，并关联 `sub.problemId`。

### 8.4 标题清洗

不同 OJ 的页面标题格式差异很大，`extractTitleScript()` 应当清洗掉：

- 题号前缀（如洛谷的 `P1055`、`CF1A`）
- 标签/分类（如 `[NOIP 2008 普及组]`、`[USACO19DEC]`）
- 网站后缀（如 ` - 洛谷`、` - Codeforces`）

最终只保留纯题目名（如 `ISBN 号码`、`Two Sum`）。

### 8.5 评测状态映射

各 OJ 的评测状态表达方式不同：

- 文本型（AcWing/牛客/VJudge）：使用 `mapVerdict()` 做中文/英文关键词匹配。
- 数字型（洛谷）：查阅 OJ 文档或反向工程确认数字含义，写 `if/else` 映射。
- 公共 `mapVerdict()` 已覆盖常见中英文词汇，新平台如果使用文本型状态，优先复用。

## 9. 测试要求

每个站点至少测试：

- 有效题目 URL。
- 带 query 的题目 URL。
- 带 hash 的题目 URL。
- 首页。
- 题目列表页。
- 提交页。
- 不相关域名。

测试不应依赖网络。

## 10. Cookie 策略

站点配置中必须明确 Cookie 策略：

- `session-only`：只依赖 Electron session，不提供 CookieVault 查询。
- `vault-readable`：允许 CookieVault 读取，用于提交同步或 VJudge 等需求。

默认策略应保守。VJudge 可以使用 `vault-readable`。

## 11. 页面抓取规则

页面元数据抓取只在以下条件满足时执行：

- 站点已启用。
- URL 已识别为题目页。
- 页面加载完成。
- 抓取器属于白名单 adapter。

抓取失败原则：

- 不影响题目记录。
- 写入诊断事件。
- 不覆盖已有可靠字段为空值。

## 12. 不允许的适配方式

禁止：

- 通过模糊字符串把大量页面误识别为题目。
- 在 Renderer 中写核心 URL parser。
- 为了一个站点在 `main.ts` 里写专用逻辑。
- 把 Cookie 明文写入调试日志。
- 抓取失败就删除题目。
- **只写后端不写前端注册**（用户会发现"前端没有这个平台"）。
- **在 executeScript 脚本字符串中使用反斜杠转义模板字符串**（会产生语法错误）。
- **直接读取 SPA 框架的注入变量而不验证数据是否过期**（会抓到错误数据）。

## 13. VJudge Contest 映射说明

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
