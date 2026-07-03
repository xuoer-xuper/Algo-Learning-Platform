# 站点适配层统一重构 + LeetCode.cn 适配 - 资料调研报告

> 调研时间：2026-06-27
> 调研范围：LeetCode.cn 平台、现有 6 站点迁移清单、通用表格扫描可行性、Electron 脚本注入方案、开源解决方案

> 维护边界：本文是历史调研材料，不能覆盖 `submission-monitoring-design.md`、`SITE_ADAPTER_GUIDE.md` 或当前 adapter 模块 README 中的已落地设计。

---

## 一、开源解决方案调研（核心发现）

### 1.1 Competitive Companion（强烈推荐参考）

- **项目地址**：https://github.com/jmerle/competitive-companion
- **类型**：浏览器扩展（TypeScript + WebExtension）
- **支持平台数**：160+ 个 OJ 平台
- **与我们项目的契合度**：⭐⭐⭐⭐⭐

**架构亮点（正是我们想要的）**：
```
src/
├── parsers/
│   ├── problem/              ← 每个平台一个文件
│   │   ├── CodeforcesProblemParser.ts
│   │   ├── AtCoderProblemParser.ts
│   │   └── ...
│   ├── contest/              ← 比赛批量解析
│   └── Parser.ts             ← 抽象基类
├── models/
│   └── Sendable.ts           ← 统一数据模型
└── content.ts                ← 入口，自动路由到对应 parser
```

**关键设计模式**：
- 每个 parser 继承自 `Parser` 基类
- 通过 `getMatchPatterns()` 声明 URL 匹配规则
- `parse()` 方法返回统一的 `Sendable` 数据结构
- **一个新平台 = 一个文件 + 零侵入主逻辑**

**对我们重构的启示**：
1. 我们的目标 `adapters/` 目录结构几乎是 CC 的翻版
2. CC 的 `Sendable` 模型等价于我们的 `SubmissionData` + `ProblemIdentity`
3. CC 用 manifest match patterns 做路由，我们可以借鉴用于 `matchProblem` / `matchSubmissionResult`
4. CC 已经验证了"每站一文件"模式在 160+ 平台上可行

**⚠️ 局限性**：
- CC 是浏览器扩展，通过 manifest 声明 content_scripts，我们是 Electron 主进程注入
- CC 只解析题目页（题目描述、样例），**不抓提交结果**——这是我们独有的需求，CC 无法直接参考
- CC 的 parser 类较重（含 DOM 选择器、HTML 清洗），我们需要更轻量的版本

### 1.2 leetcode-mcp-server（LeetCode.cn 适配核心参考）

- **项目地址**：https://github.com/jinzcdev/leetcode-mcp-server
- **类型**：MCP Server（TypeScript）
- **支持**：LeetCode Global + LeetCode.cn 双站
- **最近更新**：2026-03-18（活跃维护）

**对我们 LeetCode 适配的核心价值**：

| 能力 | 工具 | LeetCode.cn 支持 |
|------|------|------------------|
| 题目详情 | `get_problem(titleSlug)` | ✅ |
| 提交历史 | `get_all_submissions(limit, offset)` | ✅ |
| 提交代码运行 | `run_code` → 轮询 `/check/` | ✅ |
| 提交解答 | `submit_solution` → 轮询 `/check/` | ✅ |
| 用户最近提交 | `get_recent_submissions(username, limit)` | ❌（仅 Global）|
| 用户最近 AC | `get_recent_ac_submissions(username, limit)` | ❌（仅 Global）|

**关键 API 端点（已验证）**：
```
# 提交解答（异步，需轮询）
POST https://leetcode.cn/problems/{titleSlug}/submit/
→ 返回 { submissionId }
→ 轮询 GET https://leetcode.cn/submissions/detail/{submissionId}/check/
→ 返回 { statusDisplay, stateCode, ... }

# 获取提交历史（需登录态）
GET https://leetcode.cn/submissions/?offset={offset}&limit={limit}
（实际通过 GraphQL：operationName: "submissionList"）

# 题目列表（公开，建立 slug↔ID 映射）
GET https://leetcode.cn/api/problems/all/
→ stat_status_pairs[].stat.{question_id, frontend_question_id, question__title_slug}

# 题目详情（公开）
POST https://leetcode.cn/graphql
body: { query: "questionData($titleSlug: String!){ question(titleSlug: $titleSlug){ questionFrontendId title content ... } }" }
```

**反爬措施**：
- 需要 `LEETCODE_SESSION` cookie（登录态）
- GraphQL 请求需要 `x-csrftoken` header（从 cookie `csrftoken` 取）
- 建议带 `Referer: https://leetcode.cn/problems/{slug}/`
- 频率限制：建议 ≥ 1 秒间隔

### 1.3 leetgo（提交流程参考）

- **项目地址**：https://github.com/j178/leetgo
- **类型**：Go CLI 工具
- **价值**：提交后轮询机制的时序设计

**提交结果轮询的关键经验**：
```
1. POST /problems/{slug}/submit/  → 立即返回 submissionId
2. GET /submissions/detail/{id}/check/  → 轮询，间隔 1-2 秒
3. 响应字段：
   - stateCode: "STARTED" / "SUCCESS" / "FAILED"
   - statusDisplay: "Accepted" / "Wrong Answer" / ...
4. 当 stateCode === "SUCCESS" 时停止轮询
```

**leetgo 实现的指数退避重试**值得借鉴，避免高频轮询被限流。

### 1.4 leetcode-query（npm 包，可直接用）

- **项目地址**：https://github.com/JacobLinCool/LeetCode-Query
- **npm**：`leetcode-query`
- **特性**：TypeScript 原生，支持 LeetCode.cn（`LeetCodeCN` 类）

**能否直接用？**
- ✅ **可以**用于"历史提交同步"（`submissions(limit, offset)`）
- ⚠️ **不适合**用于"实时提交检测"（它是主动拉取，不是被动监听）
- ⚠️ License: MIT，但引入会加包体积

**建议**：不直接引入 npm 包，**参考其 GraphQL 查询语句**自己实现。原因：
1. 我们已有 cookie 管理（CookieVault），不需要它的 Credential 体系
2. 实时检测需要 hook XHR，不是包能解决的
3. 减少依赖

### 1.5 开源解决方案对比总结

| 方案 | 类型 | 对我们重构的价值 | 是否可直接用 |
|------|------|------------------|--------------|
| Competitive Companion | 浏览器扩展 | 架构范本（adapter 模式）| ❌ 架构参考 |
| leetcode-mcp-server | MCP Server | LeetCode API 端点清单 | ❌ 参考实现 |
| leetgo | Go CLI | 提交轮询时序设计 | ❌ 参考实现 |
| leetcode-query | npm 包 | LeetCode GraphQL 查询语句 | ⚠️ 可选引入 |

**核心结论**：**没有现成方案能直接解决"Electron 内实时检测多 OJ 提交结果"**，这正是我们要自研的价值。但 Competitive Companion 的 adapter 架构 + leetcode-mcp-server 的 API 清单 = 我们重构的两大基石。

---

## 二、LeetCode.cn 平台深度调研

### 2.1 题目 URL 与 ID 体系

**URL 格式**：
```
https://leetcode.cn/problems/{titleSlug}/
例：https://leetcode.cn/problems/two-sum/
```

**ID 体系（关键，容易踩坑）**：
- `questionId`：内部数字 ID（如 1）
- `frontendQuestionId`：前端显示题号（如 "1"，但有些题可能是 "LCP 1" 等特殊格式）
- `titleSlug`：URL slug（如 "two-sum"）

**题目 ID 获取方式**：
```
GET https://leetcode.cn/api/problems/all/
响应结构：
{
  "stat_status_pairs": [
    {
      "stat": {
        "question_id": 1,                    ← 内部 ID
        "frontend_question_id": "1",         ← 显示题号
        "question__title": "Two Sum",
        "question__title_slug": "two-sum"    ← URL slug
      },
      "difficulty": { "level": 1 },          ← 1=Easy, 2=Medium, 3=Hard
      "paid_only": false
    }
  ]
}
```

**适配策略**：
- `platformProblemId` 用 `frontendQuestionId`（用户可读，如 "1"）
- 内部缓存 slug↔ID 映射（首次访问 `/api/problems/all/` 时拉取）
- `canonicalUrl` = `https://leetcode.cn/problems/{titleSlug}/`

### 2.2 提交流程与结果检测（实时检测的核心）

**提交后行为**：
- LeetCode 是**纯 SPA**，提交后 URL 不变
- 提交触发 `POST /problems/{slug}/submit/`
- 返回 `submissionId` 后，前端自动轮询 `/submissions/detail/{id}/check/`

**实时检测的两条路径**：

**路径 A：监听 XHR（推荐，精准）**
```javascript
// 注入脚本，hook XMLHttpRequest
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._url = url;
  return originalOpen.call(this, method, url, ...args);
};
XMLHttpRequest.prototype.send = function(...args) {
  this.addEventListener('load', function() {
    if (this._url && this._url.includes('/submissions/detail/') && this._url.includes('/check/')) {
      const data = JSON.parse(this.responseText);
      if (data.stateCode === 'SUCCESS') {
        // 通过 IPC 回传：{ submissionId, statusDisplay, ... }
        window.__leetgo_result__ = data;
      }
    }
  });
  return originalSend.call(this, ...args);
};
```

**路径 B：MutationObserver 监听结果面板 DOM**
- LeetCode 提交后右下角会弹出结果面板
- 可以监听 `.success__3Ai7` / `.error__2DKF` 等类名
- **缺点**：类名是混淆的，不稳定，平台改版会失效

**推荐方案**：路径 A（XHR hook），稳定且数据完整。

### 2.3 历史提交同步

**GraphQL 查询**（需登录态）：
```graphql
query submissionList($offset: Int!, $limit: Int!, $slug: String) {
  submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
    submissions {
      id
      statusDisplay       # "Accepted" / "Wrong Answer"
      lang                # "cpp"
      runtime             # "0 ms"
      memory              # "5.9 MB"
      timestamp           # 1700000000 (秒级)
      titleSlug
      code
    }
    lastKey
    hasNext
  }
}
```

**verdict 映射**：
| LeetCode statusDisplay | 我们的 Verdict |
|------------------------|----------------|
| Accepted | AC |
| Wrong Answer | WA |
| Time Limit Exceeded | TLE |
| Memory Limit Exceeded | MLE |
| Runtime Error | RE |
| Compile Error | CE |
| Output Limit Exceeded | OLE |
| Internal Error | UNKNOWN |
| Pending / Judging | TESTING |

### 2.4 LeetCode.cn 适配清单

| 能力 | 实现方式 | 难度 |
|------|----------|------|
| 题目识别 | `matchProblem`: URL 正则 `/problems/[^/]+/?$` | 易 |
| 题目解析 | `parseProblem`: 从 URL 提取 slug，查缓存得 ID | 中（需缓存）|
| 实时提交检测 | `isSpa: true` + XHR hook 脚本 | 中 |
| 历史同步 | `syncSubmissions`: GraphQL `submissionList` | 中 |
| Cookie | `LEETCODE_SESSION`（必需）+ `csrftoken`（GraphQL 必需）| 易 |
| Verdict 映射 | 见上表 | 易 |

---

## 三、现有 6 站点迁移清单

基于 [domScraper.ts](../algo-electron/electron/submissions/scrapers/domScraper.ts) 和 [parsers/sites/](../algo-electron/electron/parsers/sites/) 的实际代码分析：

### 3.1 迁移逐站分析表

| 站点 | 题目 URL 正则 | 提交结果页 URL 正则 | 是否 SPA | 公开 API | 特化点（必须私有脚本）|
|------|--------------|---------------------|----------|----------|----------------------|
| **Codeforces** | `/contest/\d+/problem/[A-Z]`<br>`/problemset/problem/\d+/\w+`<br>`/gym/\d+/problem/[A-Z]` | `/contest/\d+/submission/\d+`<br>`/problemset/status` | ❌ 多页 | ✅ `user.status` API | **无**（用 API 即可，无需抓 DOM）|
| **AcWing** | `/problem/content/\d+/?$` | `/problem/submission/\d+/?$`<br>`/problem/activity/submissions/` | ❌ 多页 | ✅ `submission_list` API | **无**（API 返回 JSON）|
| **Nowcoder** | `/acm/contest/\d+/([A-Z]+)/?$`<br>`/problems/(\d+)/?$` | `/acm/contest/\d+/submissions/`<br>`/codeversus/submissions/` | ⚠️ 部分 SPA | ❌ | **有**：DOM 表格列名匹配（运行ID/题号/运行结果/使用语言）|
| **VJudge** | `/problem/[^/]+/[^/]+/?$` | `/problem/view/submission/\d+/?$`<br>`/status` | ❌ 多页 | ❌ | **有**：多表格定位（找含 result 列的表）|
| **PTA (pintia)** | `/problem-sets/\d+/(?:problems\|exam/problems)/\d+` | `/submissions/`<br>`/problem-sets/\d+/submissions` | ❌ 多页 | ❌ | **重**：需识别 `data-problem-id` 属性、多正则匹配、列兜底扫描 |
| **Luogu** | `/problem/P\d+/?$`<br>`/problem/[^/]+\?` | `/record/\d+/?$`<br>`/record/list` | ✅ **纯 SPA** | ⚠️ `_contentOnly=1` 参数 | **重**：从 Vue 注入数据 `_feInjection.currentData.records.result`，或 fetch `?_contentOnly=1` |

### 3.2 通用表格扫描可行性评估

**结论**：5/6 站点可用通用扫描，1 个必须特化。

| 站点 | 通用扫描可行？ | 理由 |
|------|----------------|------|
| Codeforces | ✅（但用 API 更好）| 有公开 API，根本不用抓 DOM |
| AcWing | ✅（但用 API 更好）| 有 API，返回 JSON |
| Nowcoder | ✅ | 表格结构规范，列名含"运行结果"等中文关键词 |
| VJudge | ✅ | 表格结构规范，有"评测结果/Result"列 |
| PTA | ⚠️ 勉强 | 需兜底扫描，但列名多变，建议保留特化 |
| **Luogu** | ❌ **必须特化** | 不是表格，是 Vue 渲染的 div 列表，数据在 JS 注入对象里 |

**通用扫描算法设计**（`GenericTableScanner`）：
```
1. 找页面所有 <table>
2. 对每个 table：
   a. 提取表头列名（中英文）
   b. 用 verdict 词表扫描每列，命中 verdict 关键词的列 = "结果列"
   c. 若找到结果列，提取最新一行的：
      - 提交 ID（含数字的链接 / id 列）
      - verdict（结果列文本，经 mapVerdict 翻译）
      - 语言（含"语言/Language/编译器"的列）
      - 时间/内存（含"耗时/时间/内存"的列）
3. 返回最新一条 SubmissionData
```

**verdict 词表**（已有，直接复用 [domScraper.ts](../algo-electron/electron/submissions/scrapers/domScraper.ts)）：
- 中文：答案正确/通过/部分正确/答案错误/时间超限/内存超限/...
- 英文：accepted/wrong answer/time limit/memory limit/runtime error/...
- 缩写：AC/WA/TLE/MLE/RE/CE/PE/OLE

### 3.3 迁移优先级建议

按"特化程度"排序（特化越重越优先迁移，收益越大）：

1. **Luogu**（最特化，SPA + Vue 注入）→ 迁移后删 80 行特化代码
2. **PTA**（次特化，多正则兜底）→ 迁移后删 100+ 行
3. **VJudge**（中等，多表格定位）→ 迁移后删 50 行
4. **Nowcoder**（轻特化，列名匹配）→ 通用扫描即可
5. **Codeforces / AcWing**（已有 API，最简单）→ adapter 只封装 API 调用

---

## 四、Electron 脚本注入与 IPC 方案

### 4.1 注入方式对比

| 方式 | API | 时机 | 适用场景 |
|------|-----|------|----------|
| **executeJavaScript** | `webContents.executeJavaScript(code)` | 任意时刻，一次性 | 抓取当前 DOM 状态 |
| **preload 脚本** | `webPreferences.preload` | 页面加载前 | 长驻监听（如 XHR hook）|
| **insertCSS** | `webContents.insertCSS(css)` | 页面加载后 | 隐藏元素、改样式 |

**我们的场景**：
- **历史同步**（抓表格）→ `executeJavaScript`（一次性）
- **实时检测**（hook XHR / MutationObserver）→ **需要长驻脚本**

### 4.2 长驻脚本注入方案（关键问题）

**问题**：`executeJavaScript` 注入的脚本在页面导航后会丢失。SPA 站点虽然不刷新，但用户可能手动刷新。

**方案 A：did-finish-load 重新注入（推荐）**
```typescript
webContents.on('did-finish-load', () => {
  webContents.executeJavaScript(longLivedHookScript)
})
```
- 优点：简单可靠，每次页面加载完都重新注入
- 缺点：`did-finish-load` 在 SPA 路由变化时不触发（但 SPA 不刷新页面，hook 仍在）

**方案 B：preload 脚本（更稳定，但侵入性强）**
- preload 在每个页面加载前执行，永不错过
- 但需要修改 BrowserWindow 创建逻辑，且 preload 与页面上下文隔离
- **不推荐**：我们的 BrowserHost 加载的是第三方 OJ 页面，preload 会注入到所有页面

**方案 C：MutationObserver 自注入**
```javascript
// 注入一个"自愈"脚本：检测到页面清空后重新注册
const script = `
  (function() {
    function setupHook() { /* XHR hook 逻辑 */ }
    setupHook();
    const observer = new MutationObserver(() => {
      if (!window.__myHookInstalled) {
        setupHook();
        window.__myHookInstalled = true;
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  })()
`
```
- 复杂，不推荐

**结论**：用**方案 A**（`did-finish-load` + `executeJavaScript`），配合 SPA 站点的 `did-navigate-in-page` 事件补充。

### 4.3 IPC 回传方案

**注入脚本 → 主进程**的通信：

```typescript
// 主进程：监听
ipcMain.on('submission-detected', (event, data) => {
  submissionWatcher.handleDetected(data)
})

// 注入脚本（通过 executeJavaScript）：
const script = `
  (function() {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this.addEventListener('load', function() {
        if (url.includes('/submissions/detail/') && url.includes('/check/')) {
          // 通过 IPC 回传
          require('electron').ipcRenderer.send('submission-detected', {
            url: location.href,
            responseUrl: url,
            responseText: this.responseText
          });
        }
      });
      return originalOpen.call(this, method, url, ...args);
    };
  })()
`
webContents.executeJavaScript(script)
```

**⚠️ 关键问题**：第三方 OJ 页面的渲染进程默认 `contextIsolation: true`，**`require('electron')` 不可用**！

**正确方案**：通过 `preload.ts` 暴露一个安全的 IPC 桥：
```typescript
// preload.ts
contextBridge.exposeInMainWorld('algoBridge', {
  reportSubmission: (data: any) => ipcRenderer.send('submission-detected', data)
})

// 注入脚本：
window.algoBridge.reportSubmission({ ... })
```

**这是整个方案最关键的技术约束**：必须通过 preload + contextBridge，不能在 executeJavaScript 里直接 `require`。

### 4.4 事件监听清单

| 事件 | 触发时机 | 用途 |
|------|----------|------|
| `did-navigate` | 主框架导航完成 | 传统站点：重新注入 hook |
| `did-navigate-in-page` | SPA 路由变化 | Luogu/LeetCode：URL 变了但页面没刷新 |
| `did-finish-load` | 页面加载完成 | 注入长驻脚本 |
| `dom-ready` | DOM 可访问 | 早期注入（比 did-finish-load 早）|

**推荐组合**：
- `dom-ready`：注入长驻 hook 脚本（XHR/MutationObserver）
- `did-navigate` + `did-navigate-in-page`：触发 URL 路由判断（题目页/结果页）

---

## 五、最终架构方案（修订版）

基于调研结果，对原方向文档的修订：

### 5.1 adapter 接口（修订）

```typescript
export interface SiteAdapter {
  id: string
  name: string
  domains: string[]
  homeUrl: string

  // 题目识别
  matchProblem(url: string): boolean
  parseProblem(url: string, ctx: ParseContext): Promise<ProblemIdentity | null>

  // 提交结果检测（实时）
  matchSubmissionResult?(url: string): boolean
  isSpa?: boolean
  // 注入脚本：返回 JS 字符串，会在页面 dom-ready 时执行
  // 脚本内通过 window.algoBridge.reportSubmission(data) 回传
  injectHookScript?(): string

  // 历史同步
  syncSubmissions?(ctx: SyncContext): Promise<SubmissionData[]>
}

export interface ParseContext {
  // 用于查询 slug→ID 缓存（LeetCode 需要）
  getCache(key: string): Promise<any>
  setCache(key: string, value: any): Promise<void>
}
```

### 5.2 SubmissionWatcher 工作流（修订）

```
webContents.on('dom-ready')
    ↓
检查当前 URL 对应哪个 adapter
    ↓
adapter.matchProblem(url)?  → 记录当前题目
    ↓
adapter.injectHookScript()? → executeJavaScript 注入长驻脚本
    ↓
                    （用户提交，XHR 触发）
                            ↓
        注入脚本调用 window.algoBridge.reportSubmission(data)
                            ↓
                ipcMain.on('submission-detected')
                            ↓
                    SubmissionWatcher.handleDetected()
                            ↓
            1. 识别 adapter（从 URL）
            2. 调用 adapter.parseSubmissionResult(data)  ← 新增方法
            3. 关联当前题目
            4. 写入 submissions 表
            5. recomputeDailyStats()
```

### 5.3 关键技术约束（必须遵守）

1. **IPC 桥**：必须在 [preload.ts](../algo-electron/electron/preload.ts) 通过受控 bridge 暴露通信接口
2. **时间处理**：所有时间用 `nowBeijing()` / `toBeijing()`，禁止 `toISOString()`
3. **注入时机**：`dom-ready` 注入 hook，`did-navigate-in-page` 触发 URL 路由
4. **防重复**：watcher 要去重（同一 submissionId 不重复写入）
5. **错误隔离**：adapter 内任何异常不能影响其他站点或主进程

### 5.4 迁移阶段（修订）

**阶段 1（1-2 天）**：搭建骨架
- `adapters/types.ts`、`adapters/registry.ts`
- `submissions/SubmissionWatcher.ts`
- `submissions/scrapers/GenericTableScanner.ts`
- `adapters/verdictMap.ts`
- preload.ts 添加 `algoBridge`

**阶段 2（2-3 天）**：迁移 + LeetCode
- 先迁移 Luogu（验证 SPA 方案）
- 再迁移 PTA、VJudge、Nowcoder（验证通用扫描）
- 最后 Codeforces/AcWing（封装 API）
- 新增 LeetCode adapter（用 XHR hook 方案）

**阶段 3（半天）**：清理
- 删除 `domScraper.ts`、`parsers/`、`sites/`
- `syncService.ts` 简化
- 回归测试

---

## 六、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| LeetCode 类名混淆变化 | 实时检测失效 | 用 XHR hook（监听 URL 模式），不依赖 DOM 类名 |
| PTA 多正则适配复杂 | 迁移成本高 | 保留 PTA 特化脚本，不强求通用 |
| Luogu 反爬升级 | Vue 注入数据不可用 | 降级到 `?_contentOnly=1` fetch，再降级到 DOM |
| Electron executeJavaScript 权限被拒 | hook 注入失败 | try/catch，失败时降级到手动同步 |
| IPC 桥被 OJ 页面覆盖 | 回传失败 | 用冷门 channel 名（`__algo_submission_v1`）|

---

## 七、参考资料

### 开源项目
- [Competitive Companion](https://github.com/jmerle/competitive-companion) — 160+ 平台的 adapter 架构范本
- [leetcode-mcp-server](https://github.com/jinzcdev/leetcode-mcp-server) — LeetCode.cn API 端点权威清单
- [leetgo](https://github.com/j178/leetgo) — 提交轮询时序设计参考
- [LeetCode-Query](https://github.com/JacobLinCool/LeetCode-Query) — GraphQL 查询语句参考

### 官方文档
- [Electron webContents API](https://www.electronjs.org/docs/latest/api/web-contents) — `did-navigate`、`executeJavaScript`
- [Electron ipcRenderer](https://www.electronjs.org/docs/latest/api/ipc-renderer) — IPC 通信
- [LeetCode GraphQL API](https://leetcode.cn/graphql) — 题目详情、提交历史

### 技术博客
- [Competitive Companion 深度剖析](https://blog.csdn.net/gitblog_07970/article/details/148942839) — Codeforces 解析器痛点分析
- [LeetCode 爬取实践](https://juejin.cn/post/6862699115600576526) — slug↔ID 映射方案
