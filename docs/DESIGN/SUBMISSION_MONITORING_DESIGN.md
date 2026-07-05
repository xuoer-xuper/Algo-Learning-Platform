# 提交监测设计说明

## 1. 目标

提交监测负责把用户在内置浏览器中的一次正式提交，转换成本地 `submissions` 记录，并尽量关联到当前题目。

当前覆盖 Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode。模块不负责登录、验证码处理、Cookie 策略变更、源码保存或数据库 schema 变更。

## 2. 实时数据流

```text
BrowserHost / TabManager
  -> RealtimeHookInjector
  -> adapter registry
  -> site adapter injectHookScript()
  -> SubmissionDetectionPayload
  -> SubmissionWatcherCore
  -> site adapter parseSubmissionResult()
  -> resolveProblemIdentity()
  -> SubmissionBatchWriter
  -> SQLite
```

`registry` 只负责 adapter 注册和查找。站点 URL 解析、提交解析、实时 hook、题目身份解析应放在 `algo-electron/electron/adapters/sites/{site}/` 目录内。

## 3. 手动同步数据流

```text
当前 WebContentsView 页面
  -> domScraper 或 site scrapeSubmissions()
  -> GenericTableScanner / 站点专用 scraper
  -> syncService
  -> SubmissionBatchWriter
```

手动打开提交记录页的表格同步逻辑继续保留，但不能替代实时提交监测的 submit intent 边界。

## 4. 安全边界

提交监测默认 fail closed：

- `TESTING`、`UNKNOWN`、排队、运行中、编译中不入库。
- 没有最近正式提交 intent 的实时结果不入库。
- 自测、调试、样例测试、run code、custom test 不入库。
- 查看提交记录、刷新历史页、打开提交详情不应产生新提交。
- Cookie、用户源码、完整请求体不写入普通日志或诊断 payload。
- DOM 文本默认不可信，除非站点 adapter 明确做了 intent、稳定性和身份关联校验。

`SubmissionWatcherCore` 是最后一道保护：即使 adapter 返回了数据，核心仍会拒绝 `TESTING` 和 `UNKNOWN`。

## 5. Submit Intent

Submit intent 是实时结果归因边界。注入脚本只在正式提交按钮、正式提交表单、正式提交接口出现时记录 intent。

intent 至少包含：

- 本地生成的 intent id 或时间戳。
- 触发时间。
- 触发来源。
- 当时题目页 URL。
- 可选语言、用户、submission id。

遇到自测、调试、查看上次提交、打开记录页或打开详情页时，应清理或阻断 intent。

## 6. 站点策略

Codeforces：

- 支持题库页、比赛页、Gym 页。
- `TESTING` 状态可能需要刷新后才变成最终结果。
- 实时扫描不能在最新行判题中时回退旧记录。

AcWing：

- 使用前端结果观察和表格解析。
- 语言从页面或结果 payload 中补齐。
- pending 文案不入库。

牛客：

- 实时写入只接受 `nowcoder-judge-status` 等网络评测 payload。
- DOM 弹窗、自测面板、提交记录表格不作为实时写入来源。
- 自测、调试、run、sample、custom test 请求会清理 intent。
- 失败类文本优先于 AC 文本。

VJudge：

- 优先用正式提交返回的 solution id 关联结果。
- `/status/data/` 必须匹配当前题目、当前用户或当前 solution id。
- `WA Pascal 2026-...` 这类公开状态行不入库。
- 详情页 DOM 兜底必须能看到 solution id 或详情链接。

PTA：

- 提交记录表格和结果弹窗都可作为来源。
- 弹窗路径必须 submit-intent gated。
- 查看最后一次提交、自测、记录页操作会阻断或清理 intent。

洛谷：

- 优先 `_contentOnly=1` JSON。
- `window._feInjection` 只能降级使用，不能默认当作最新数据。
- 数字状态码映射为统一 verdict。

LeetCode：

- 区分 run code 和 submit。
- 区分 run id 与 submit id。
- 嵌套 pending / judging 信号会阻断写入。

## 7. 目录分层

每个站点目录至少包含：

- `index.ts`：组装 `SiteAdapter`，不承载大段站点细节。
- `problem.ts`：题目 URL 解析、提交结果页匹配、题目身份辅助函数。

站点需要更多职责时继续按职责拆分：

- `submissions.ts`：提交 payload、表格、API 结果解析。
- `tables.ts`：提交记录表格解析。
- `hook.ts`：站点实时 hook 注入脚本。
- `urls.ts`：复杂 URL 构造和规范化。

当前已拆分状态：

- Codeforces：`problem.ts`、`submissions.ts`、`hook.ts`、`urls.ts`。
- AcWing：`problem.ts`、`submissions.ts`。
- 牛客：`problem.ts`、`submissions.ts`、`tables.ts`、`hook.ts`。
- VJudge：`problem.ts`、`submissions.ts`、`hook.ts`。
- PTA：`problem.ts`、`submissions.ts`。
- 洛谷：`problem.ts`、`submissions.ts`。
- LeetCode：`problem.ts`、`submissions.ts`、`hook.ts`。

## 8. 测试要求

每个行为变化必须有 adapter、submission core 或 scraper 测试覆盖：

- pending / judging / running 不入库。
- 正式 AC、WA、CE 等最终结果写入一次。
- 自测成功和自测失败不入库。
- 查看记录、打开详情、刷新页面不重复写入。
- 平台提交 ID、语言、题目关联、sourceUrl 正确。
- 当前题或当前用户无法关联时不写入。

推荐命令：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests/adapters/*.test.ts
npx --yes tsx tests/submissions/*.test.ts
```

如果通配符执行受环境影响，可以逐个 bundle 后执行测试。

## 9. 手测流程

每站手测时记录测试 URL、登录状态、提交 ID、实际 verdict、是否刷新或跳转、数据库/UI 最终表现。

验收标准：

- 提交后不会在判题中入库。
- 最终结果只入库一次。
- 语言、题目关联、sourceUrl、平台提交 ID 正确。
- 查看提交记录或详情不会新增重复提交。
- 未登录或被验证码阻断时不误写入，只标记为待测。
