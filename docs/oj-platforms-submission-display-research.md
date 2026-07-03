# 7 大 OJ 平台提交结果展示情况调研报告

> 调研时间：2026-06-29
> 调研对象：AcWing、Luogu、Codeforces、VJudge、PTA、LeetCode.cn、Nowcoder
> 调研目的：为站点适配层重构提供提交结果展示机制的详细参考

> 维护边界：本文是历史调研材料，不能覆盖 `submission-monitoring-design.md`、`SITE_ADAPTER_GUIDE.md` 或当前 adapter 模块 README 中的已落地设计。

---

## 一、总览对比表

| 平台 | 域名 | 结果展示形态 | 是否 SPA | 公开 API | 实时检测推荐方案 | 难度 |
|------|------|--------------|----------|----------|------------------|------|
| **AcWing** | acwing.com | 多页 HTML 表格 | ❌ | ✅ `submission_list` | API 拉取 | 易 |
| **Luogu** | luogu.com.cn | Vue SPA + JSON 注入 | ✅ 纯 SPA | ⚠️ `?_contentOnly=1` | 注入数据 / fetch 参数 | 难 |
| **Codeforces** | codeforces.com | 多页 HTML 表格 | ❌ | ✅ `user.status` | API 拉取 | 易 |
| **VJudge** | vjudge.net | AJAX 加载表格 | ⚠️ 部分 | ❌ | hook XHR `/status/data/` | 中 |
| **PTA** | pintia.cn | 多页 HTML 表格 | ❌ | ❌ | DOM 表格扫描 | 中 |
| **LeetCode.cn** | leetcode.cn | React SPA + XHR 轮询 | ✅ 纯 SPA | ⚠️ GraphQL | hook XHR `/check/` | 中 |
| **Nowcoder** | nowcoder.com | 多页 HTML 表格 | ❌ | ❌ | DOM 表格扫描 | 易 |

---

## 二、逐平台详细分析

### 2.1 AcWing（acwing.com）

#### 提交结果页 URL 格式
```
单次提交结果：https://www.acwing.com/problem/submission/{submissionId}/
提交记录列表：https://www.acwing.com/problem/activity/submissions/
```

#### 展示机制
- **传统多页 HTML**，提交后页面跳转到 `/problem/submission/{id}/`
- 表格列名：提交编号 / 题目 / 结果 / 语言 / 时间 / 内存 / 提交时间
- 结果以彩色标签展示（绿色=AC，红色=WA 等）

#### 公开 API（推荐使用）
```
POST https://www.acwing.com/problem/submission_list/
参数：problem_id, page
返回：JSON { submissions: [{ id, status, lang, time, memory, ... }] }
```

#### Verdict 状态
| 中文 | 含义 |
|------|------|
| 答案正确 | AC |
| 答案错误 | WA |
| 时间超限 | TLE |
| 内存超限 | MLE |
| 运行错误 | RE |
| 编译错误 | CE |

#### 适配建议
- **优先用 API**，避免 DOM 解析
- 需要 cookie 维持登录态（`_acid` session）

---

### 2.2 Luogu（luogu.com.cn）

#### 提交结果页 URL 格式
```
单次提交结果：https://www.luogu.com.cn/record/{recordId}
提交记录列表：https://www.luogu.com.cn/record/list
```

#### 展示机制（**最特殊，纯 SPA + Vue 注入数据**）
- 洛谷采用**严格的前后端分离**架构
- 页面 HTML 中包含一个 `<script>` 标签，内含 URL 编码的 JSON 数据
- 数据路径：`window._feInjection.currentData.record`
- DOM 是 Vue 渲染的 div 列表，**不是 table**

#### 数据提取方式（3 选 1）

**方式 1：解析注入的 script 数据（推荐）**
```javascript
// 注入脚本提取
const script = document.querySelector('script:not([src])');
const raw = decodeURIComponent(script.textContent.split('"')[1]);
const data = JSON.parse(raw);
const record = data.currentData.record;
// record 包含：status, memory, time, language, sourceCode, ...
```

**方式 2：fetch 带 `?_contentOnly=1` 参数**
```
GET https://www.luogu.com.cn/record/{id}?_contentOnly=1
返回：JSON { currentData: { record: {...} } }
```

**方式 3：DOM 扫描（最不稳定）**
- 洛谷的 class 名经过混淆（如 `success__3Ai7`），不推荐

#### Verdict 状态
| 标签 | 中文名称 | 含义 |
|------|----------|------|
| ✅ AC | 答案正确 | 通过所有测试点 |
| ⚠️ PC | 部分正确 | OI 赛制部分通过 |
| ❌ WA | 答案错误 | 答案不匹配 |
| 🔶 PE | 格式错误 | 格式不规范 |
| ❌ TLE | 时间超限 | 超时 |
| ❌ MLE | 内存超限 | 超内存 |
| ❌ RE | 运行时错误 | 崩溃 |
| ❌ CE | 编译错误 | 语法错误 |
| 🔵 WAIT | 等待评测 | 排队中 |
| 🔵 RJ | 重测中 | 重新评测 |
| ❌ UKE/SE | 系统错误 | 平台异常 |

#### 反爬措施
- **强制登录**：所有页面都需要 cookie（`_uid` + `__client_id`）
- 高频访问会触发限流（建议 ≥ 2 秒间隔）
- robots.txt 禁止爬取提交记录

#### 适配建议
- **必须特化**，不能用通用表格扫描
- 推荐用方式 1（解析注入数据），稳定且数据完整
- 降级方案：方式 2（fetch `_contentOnly=1`）

---

### 2.3 Codeforces（codeforces.com）

#### 提交结果页 URL 格式
```
单次提交：https://codeforces.com/contest/{contestId}/submission/{submissionId}
提交列表：https://codeforces.com/submissions/{handle}
状态页：https://codeforces.com/problemset/status
```

#### 展示机制
- 传统多页 HTML 表格
- 列名：When / Who / Problem / Lang | Verdict | Time | Memory
- verdict 以彩色文字展示

#### 公开 API（**强烈推荐使用**）
```
GET https://codeforces.com/api/user.status?handle={handle}&from=1&count=100
返回：JSON { status: "OK", result: [{ id, verdict, programmingLanguage, timeConsumedMillis, memoryConsumedBytes, problem: {contestId, index, name, rating} }] }
```

**优点**：
- 无需认证（公开数据）
- 速率限制宽松（未认证 1 次/秒，足够使用）
- 数据结构清晰

#### Verdict 状态（API 返回英文枚举）
| API verdict | 含义 |
|-------------|------|
| OK | Accepted |
| WRONG_ANSWER | Wrong Answer |
| TIME_LIMIT_EXCEEDED | TLE |
| MEMORY_LIMIT_EXCEEDED | MLE |
| RUNTIME_ERROR | RE |
| COMPILATION_ERROR | CE |
| CHALLENGED | 被黑客攻击后失败 |
| SKIPPED | 跳过 |
| TESTING | 评测中 |
| REJECTED | 拒绝（非正式提交）|

#### 适配建议
- **直接用 API**，完全不需要抓 DOM
- 只需要保存用户 handle（从 cookie 或 URL 提取）

---

### 2.4 VJudge（vjudge.net）

#### 提交结果页 URL 格式
```
单次提交：https://vjudge.net/problem/view/submission/{submissionId}
状态列表：https://vjudge.net/status
比赛状态：https://vjudge.net/contest/{contestId}#status
```

#### 展示机制
- 表格通过 **AJAX 动态加载**（jQuery DataTables 风格）
- 列名：Run # / Problem / Verdict / Time / Memory / Author / Language / Length / When

#### 数据接口（可 hook）
```
POST https://vjudge.net/status/data/
Content-Type: application/x-www-form-urlencoded
参数（DataTables 风格）：draw, start, length, columns[...]
返回：JSON { data: [[runId, problem, verdict, time, memory, ...]] }
```

#### Verdict 状态
| 状态 | 含义 |
|------|------|
| Accepted | AC |
| Presentation Error | PE |
| Wrong Answer | WA |
| Runtime Error | RE (ARRAY_BOUNDS_EXCEEDED / DIVIDE_BY_ZERO / ACCESS_VIOLATION / STACK_OVERFLOW) |
| Time Limit Exceeded | TLE |
| Memory Limit Exceeded | MLE |
| Output Limit Exceeded | OLE |
| Compile Error | CE |
| System Error | SE |
| Waiting | 等待中 |
| Judging | 评测中 |
| Judge Delay | 评判超时 |
| Judge Error | 评判程序错误 |

#### 反爬措施
- token 频繁更换（带时间戳）
- 需要登录态（JSESSIONID cookie）

#### 适配建议
- 推荐 **hook XHR**，监听 `/status/data/` 响应
- 也可用 DOM 扫描（表格规范，含 "Verdict" 列）
- 需要登录后才能获取完整数据

---

### 2.5 PTA（pintia.cn）

#### 提交结果页 URL 格式
```
提交记录列表：https://pintia.cn/problem-sets/{setId}/exam/submissions
全部提交：https://pintia.cn/problem-sets/{setId}/exam/submissions?tab=all
```

#### 展示机制
- 多页 HTML 表格
- 列名（9 列）：**Submit At | Status | Score | Problem | Compiler | Memory Usage | Time Usage | Submitter | Detail**
- Status 列有彩色标签
- 题目链接含 `data-problem-id` 属性

#### Verdict 状态
| 状态 | 含义 |
|------|------|
| Accepted | AC |
| Partially Accepted | 部分通过（OI 赛制）|
| Wrong Answer | WA |
| Presentation Error | PE |
| Time Limit Exceeded | TLE |
| Memory Limit Exceeded | MLE |
| Runtime Error | RE |
| Compile Error | CE |
| Multiple Errors | 多种错误 |
| Waiting | 等待中 |

#### 特殊点
- **有 Score 列**（部分通过得分）
- TLE 时 Time Usage 显示 `-`
- CE 时 Memory 和 Time 都为 `0`

#### 适配建议
- 用 DOM 扫描，但需要识别 `data-problem-id` 属性
- 表格列名稳定，可走通用扫描器
- 需要登录态（PTA 的 session cookie）

---

### 2.6 LeetCode.cn（leetcode.cn）

#### 提交结果页 URL 格式
```
提交详情页：https://leetcode.cn/submissions/detail/{submissionId}/
题目提交列表：https://leetcode.cn/problems/{titleSlug}/submissions/
```

#### 展示机制（**纯 SPA，最特殊**）
- **提交后 URL 不变**，纯前端轮询
- 提交流程：
  1. `POST /problems/{slug}/submit/` → 返回 `{ submissionId }`
  2. 前端自动轮询 `GET /submissions/detail/{id}/check/`
  3. 响应字段：`stateCode` ("STARTED" / "SUCCESS" / "FAILED") + `statusDisplay`

#### 实时检测方案（hook XHR）

**关键 URL 模式**：`/submissions/detail/{id}/check/`

```javascript
// 注入脚本 hook XMLHttpRequest
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this.addEventListener('load', function() {
    if (url.includes('/submissions/detail/') && url.includes('/check/')) {
      const data = JSON.parse(this.responseText);
      if (data.stateCode === 'SUCCESS') {
        // 通过 algoBridge 回传：{ submissionId, statusDisplay, runtime, memory, lang }
      }
    }
  });
  return originalOpen.call(this, method, url, ...args);
};
```

#### 历史同步方案（GraphQL）

```graphql
query submissionList($offset: Int!, $limit: Int!, $slug: String) {
  submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
    submissions {
      id
      statusDisplay
      lang
      runtime
      memory
      timestamp
      titleSlug
    }
    lastKey
    hasNext
  }
}
```

#### Verdict 状态（`statusDisplay` 字段）
| statusDisplay | 含义 |
|---------------|------|
| Accepted | AC |
| Wrong Answer | WA |
| Time Limit Exceeded | TLE |
| Memory Limit Exceeded | MLE |
| Runtime Error | RE |
| Compile Error | CE |
| Output Limit Exceeded | OLE |
| Internal Error | 系统错误 |
| Pending / Judging | 评测中 |

#### 反爬措施
- **必须登录态**：`LEETCODE_SESSION` cookie
- GraphQL 请求需要 `x-csrftoken` header（从 `csrftoken` cookie 取）
- 建议带 `Referer: https://leetcode.cn/problems/{slug}/`
- 频率限制：建议 ≥ 1 秒间隔

#### 适配建议
- **实时检测**：hook XHR 监听 `/check/` URL 模式（不依赖易变的 DOM 类名）
- **历史同步**：GraphQL `submissionList` 查询
- 题目 ID 用 `frontendQuestionId`（用户可读），缓存 slug↔ID 映射（`/api/problems/all/`）

---

### 2.7 Nowcoder（nowcoder.com）

#### 提交结果页 URL 格式
```
单次提交：https://ac.nowcoder.com/acm/contest/view-submission?submissionId={id}
练习提交记录：https://ac.nowcoder.com/acm/contest/profile/{uid}/practice-coding
比赛提交记录：https://ac.nowcoder.com/acm/contest/{contestId}/submissions
```

#### 展示机制
- 多页 HTML 表格
- 列名（9 列）：**运行ID | 题目 | 运行结果 | 得分 | 运行时间(ms) | 使用内存(KB) | 代码长度 | 使用语言 | 提交时间**
- 运行结果列有彩色链接标签

#### Verdict 状态（中文）
| 中文 | 含义 |
|------|------|
| 答案正确 | AC |
| 答案错误 | WA |
| 部分正确 | PE（OI 赛制部分通过）|
| 时间超限 | TLE |
| 内存超限 | MLE |
| 运行错误 | RE |
| 编译错误 | CE |
| 输出超限 | OLE |
| 未知错误 | UKE |
| 运行中 | 评测中 |

#### 特殊点
- **有得分列**（OI 赛制）
- 运行ID 是链接，点击可查看提交详情
- 题目列也是链接，URL 含 problem_id

#### 反爬措施
- 需要登录态（NOWCODERUID cookie）
- 部分接口需要 anti-bot token

#### 适配建议
- 表格结构规范，**可直接走通用表格扫描器**
- 列名含中文关键词（"运行结果"），易识别
- 运行 ID 提取从链接的 `submissionId` 参数获取

---

## 三、字段统一映射表

将 7 平台字段统一映射到我们的 `SubmissionData`：

| 我们的字段 | AcWing | Luogu | Codeforces | VJudge | PTA | LeetCode | Nowcoder |
|-----------|--------|-------|------------|--------|-----|----------|----------|
| submissionId | id | id | id | runId | (无显式ID) | id | 运行ID |
| verdict | status | status | verdict | verdict | Status | statusDisplay | 运行结果 |
| language | lang | language | programmingLanguage | Language | Compiler | lang | 使用语言 |
| time | time | time | timeConsumedMillis | Time | Time Usage | runtime | 运行时间(ms) |
| memory | memory | memory | memoryConsumedBytes | Memory | Memory Usage | memory | 使用内存(KB) |
| score | - | - | - | - | Score | - | 得分 |
| timestamp | created_at | created_at | creationTimeSeconds | When | Submit At | timestamp | 提交时间 |

---

## 四、实时检测方案分类

### 4.1 方案 A：API 主动拉取（最简单）
**适用平台**：AcWing、Codeforces

- 用户提交后，定时调用平台的公开 API
- 优点：稳定，不依赖 DOM
- 缺点：无法精确感知"用户何时提交"，需要轮询

### 4.2 方案 B：DOM 表格扫描
**适用平台**：PTA、Nowcoder

- 监听 `did-navigate` 事件，检测 URL 跳转到提交结果页
- 注入脚本扫描表格，提取最新一行
- 优点：实现简单
- 缺点：依赖 DOM 结构，平台改版会失效

### 4.3 方案 C：XHR Hook（推荐）
**适用平台**：VJudge、LeetCode

- 在 `dom-ready` 时注入长驻脚本，hook `XMLHttpRequest`
- 监听特定 URL 模式的响应
- 优点：数据完整、稳定（URL 模式比 DOM 类名稳定）
- 缺点：需要处理 contextIsolation

### 4.4 方案 D：解析注入数据
**适用平台**：Luogu

- 注入脚本读取 `window._feInjection.currentData`
- 或 fetch `?_contentOnly=1` 获取 JSON
- 优点：数据结构化
- 缺点：洛谷专有，无可复用性

---

## 五、通用表格扫描器可行性

| 平台 | 通用扫描可行？ | 理由 |
|------|----------------|------|
| AcWing | ✅（但 API 更好）| 表格规范 |
| Codeforces | ✅（但 API 更好）| 表格规范 |
| **PTA** | ✅ | 9 列规范表格，Status 列易识别 |
| **Nowcoder** | ✅ | 9 列规范表格，"运行结果"中文关键词 |
| VJudge | ⚠️ | AJAX 表格，需 hook 后扫描 |
| **LeetCode** | ❌ | 纯 SPA，无 table，必须 hook XHR |
| **Luogu** | ❌ | 纯 SPA，无 table，必须解析注入数据 |

**结论**：7 个平台中，2 个用 API、2 个用通用扫描、1 个用 XHR hook、1 个用注入数据解析、1 个既可用 XHR hook 也可用通用扫描。

---

## 六、反爬措施汇总

| 平台 | 登录态要求 | Cookie 名称 | 频率限制 | 特殊措施 |
|------|-----------|-------------|----------|----------|
| AcWing | 必须 | `_acid` | 宽松 | - |
| Luogu | 必须 | `_uid` + `__client_id` | 严格（≥2s）| robots.txt 禁止 |
| Codeforces | API 不需要 | - | 1 次/秒 | API 签名（私有方法）|
| VJudge | 必须 | `JSESSIONID` | 中等 | token 时间戳校验 |
| PTA | 必须 | session | 中等 | - |
| LeetCode | 必须 | `LEETCODE_SESSION` + `csrftoken` | 严格（≥1s）| GraphQL 需 x-csrftoken |
| Nowcoder | 必须 | `NOWCODERUID` | 中等 | 部分 anti-bot |

---

## 七、适配优先级建议

按"实现难度从易到难"排序：

1. **Codeforces**（⭐ 最易）— 纯 API，无 DOM
2. **AcWing**（⭐ 最易）— 纯 API
3. **Nowcoder**（⭐⭐ 易）— 通用表格扫描
4. **PTA**（⭐⭐⭐ 中）— 通用扫描 + 特殊字段（Score）
5. **VJudge**（⭐⭐⭐ 中）— XHR hook
6. **LeetCode**（⭐⭐⭐ 中）— XHR hook + GraphQL 同步
7. **Luogu**（⭐⭐⭐⭐ 难）— 注入数据解析，最特殊

---

## 八、关键技术约束

### 8.1 IPC 桥（必须）
所有需要注入脚本的平台（Luogu、LeetCode、VJudge），都必须通过 [preload.ts](../algo-electron/electron/preload.ts) 的受控 bridge 暴露 IPC 接口，**不能在 `executeJavaScript` 里直接 `require('electron')`**。

### 8.2 注入时机
- `dom-ready`：注入长驻 hook 脚本
- `did-navigate`：传统站点刷新后重新注入
- `did-navigate-in-page`：SPA 站点路由变化时触发 URL 判断

### 8.3 时间处理
所有时间统一用 `nowBeijing()` / `toBeijing()`，禁止 `toISOString()`（避免时区错乱）。

---

## 九、参考资料

### 平台官方文档
- [Codeforces API 官方文档](https://codeforces.com/apiHelp)
- [LeetCode.cn 帮助中心 - 提交记录](https://leetcode.cn/help-center/3813455/)
- [PTA 考试系统使用指南](https://wiki.ccf.thusaac.com/PTA/guide/)

### 技术博客
- [洛谷提交记录爬虫](https://www.ruanx.net/luogu-spider/) — Vue 注入数据提取方案
- [爬取 vjudge 的比赛代码](https://blog.csdn.net/Joovo/article/details/84901503) — VJudge XHR 接口分析
- [基于 Python 爬取 LeetCode 提交记录](https://wenku.csdn.net/doc/4gdvmnhuao) — LeetCode 登录态与 XHR 逆向
- [洛谷评测结果全解析](https://www.cnblogs.com/wyh1997/p/19777278) — Verdict 状态对照表

### 开源参考
- [Competitive Companion](https://github.com/jmerle/competitive-companion) — 160+ 平台 adapter 架构
- [leetcode-mcp-server](https://github.com/jinzcdev/leetcode-mcp-server) — LeetCode API 端点清单
