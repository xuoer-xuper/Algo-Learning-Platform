# AI 协作流程（AI_WORKFLOW）

## 1. 目标

本项目会长期由 Cursor、Claude、GPT、Codex 等多个 AI Agent 协作。本文档用于保证所有 Agent 使用同一套流程，不因为重复实现、越界修改、文档缺失或任务不清导致项目失控。

核心原则：

- 先读文档，再动代码。
- 先确认任务编号，再开始实现。
- 每次只做小任务。
- 改代码必须同步改交接文档。
- 涉及数据库、IPC、Cookie、浏览器核心时必须格外谨慎。

## 2. Agent 开始前必须阅读

按顺序阅读：

1. `PROJECT_RULES.md`
2. `ROADMAP.md`
3. `TASKS.md`
4. `AI_HANDOFF.md`
5. `ARCHITECTURE.md`
6. `DATABASE_SCHEMA.md`
7. `COMMIT_RULES.md`
8. 如涉及站点，阅读 `SITE_ADAPTER_GUIDE.md`
9. 如涉及关键架构决策，阅读 `docs/adr/`
10. 如本次任务是审查、评审或验收，阅读 `PROMPT.md`

未读完这些文档，不允许开始编码。

## 3. 开工声明

Agent 开始前必须向用户说明：

- 本次任务编号。
- 本次目标。
- 涉及文件或模块。
- 是否涉及数据库 schema。
- 是否涉及 IPC / Preload。
- 是否涉及 Cookie。
- 是否涉及站点规则。
- 预计验证方式。

示例：

```text
本次执行 P1-003：迁移 BrowserView 到 WebContentsView。
涉及 electron/main.ts、electron/browser/BrowserHost.ts。
不涉及数据库。
涉及 IPC 但不新增 channel。
不读取 Cookie。
验证方式：启动应用，确认默认网站加载、导航和 URL 变化正常。
```

可复制模板：

```text
本次任务：<任务编号> <任务名称>
目标：<一句话说明本次要完成什么>
涉及模块：<文件夹或模块>
数据库影响：无 / 有，涉及 <表名或 migration>
IPC/Preload 影响：无 / 有，涉及 <channel 或 API>
Cookie 影响：无 / 有，说明用途和保护方式
站点适配影响：无 / 有，涉及 <site id>
验证方式：<准备运行的检查、测试或人工验证>
预计文档更新：TASKS.md、AI_HANDOFF.md、其他相关文档
```

## 4. 任务领取规则

- 默认按 `TASKS.md` 的“下一位 Agent 固定起点”领取任务。
- 用户指定任务时，以用户指定为准。
- 如果任务前置未完成，先停止并说明缺少哪个前置任务。
- 如果发现任务拆分不够细，可以新增子任务，但不得删除原任务。

## 4.1 实现指导文档选择

不同任务读取不同指导文档，不要混用职责：

- 系统结构、目录、进程边界、BrowserHost、Preload、IPC、CookieVault、Tracking、Analytics：以 `ARCHITECTURE.md` 为准。
- SQLite 表、字段、索引、迁移、数据约束：以 `DATABASE_SCHEMA.md` 为准。
- 任务顺序、任务状态、前置条件、验收标准：以 `TASKS.md` 为准。
- 当前代码现场和下一步交接：以 `AI_HANDOFF.md` 为准。
- 关键决策原因：查看 `docs/adr/`，ADR 不替代任务清单和实现文档。

## 5. 修改范围规则

每次只允许修改与任务直接相关的模块。

高风险文件：

- `electron/main.ts`
- `electron/preload.ts`
- `DATABASE_SCHEMA.md`
- 数据库 migration
- IPC channel 定义
- CookieVault
- Site Registry

修改高风险文件必须在 `AI_HANDOFF.md` 记录原因、影响和下一步。

## 6. 数据库修改流程

涉及数据库时必须：

1. 阅读 `DATABASE_SCHEMA.md`。
2. 新增或修改 migration。
3. 更新 repository。
4. 更新 `DATABASE_SCHEMA.md`。
5. 更新 `TASKS.md`。
6. 更新 `AI_HANDOFF.md`。
7. 说明是否需要数据迁移或备份。

禁止：

- 只改代码不改 schema 文档。
- 在业务代码里临时建表。
- 没有 migration 就改表结构。

## 7. IPC 修改流程

涉及 IPC 时必须：

1. 在 channel 定义中新增 typed channel。
2. 在 Main Process 注册 handler。
3. 在 Preload 暴露白名单 API。
4. 更新 Renderer 调用封装。
5. 确认不暴露通用 `ipcRenderer`。
6. 在 `AI_HANDOFF.md` 记录新增 API。

## 8. Cookie 修改流程

涉及 Cookie 时必须：

- 使用 CookieVault。
- 不在普通日志输出 Cookie 值。
- 不把 Cookie 放入 Renderer store。
- 不把 Cookie 放入导出 JSON。
- 不把 Cookie 放入 sync_queue。
- UI 默认只展示 Cookie 是否存在、过期时间、用途，不展示完整值。

如确实需要显示或复制 Cookie，必须有明确用户动作和风险提示。

## 9. 站点适配流程

新增或修改站点时必须：

1. 阅读 `SITE_ADAPTER_GUIDE.md`。
2. 更新 Site Registry 或 adapter。
3. 添加 URL 样例。
4. 添加有效和无效 URL 测试。
5. 更新站点文档。
6. 更新 `AI_HANDOFF.md`。

站点适配优先级：

1. 配置化 URL 规则。
2. 专用 parser adapter。
3. 页面内容抓取。

## 10. 完成后必须更新

每次完成后：

- `TASKS.md`：任务状态改为已完成。
- `AI_HANDOFF.md`：写明完成内容、验证结果、风险、下一步。
- 涉及架构：更新 `ARCHITECTURE.md`。
- 涉及数据库：更新 `DATABASE_SCHEMA.md`。
- 涉及站点：更新 `SITE_ADAPTER_GUIDE.md`。
- 给出中文提交信息建议。

## 11. 自检清单

提交前自查：

- 是否完成指定任务。
- 是否误改无关文件。
- 是否继续扩展了 `BrowserView`。
- 是否暴露了通用 `ipcRenderer`。
- 是否把 Cookie 写进日志、导出或同步。
- 是否更新了相关文档。
- 是否给出验证结果。

## 12. 多 Agent 并行规则

可以并行的任务：

- 不同站点 parser 测试。
- Renderer 独立页面。
- 文档补充。
- 非冲突的统计视图。

不建议并行的任务：

- 数据库 schema。
- BrowserHost。
- Preload API。
- CookieVault。
- Site Registry 核心结构。

如必须并行，先在 `AI_HANDOFF.md` 记录分工和文件边界。

## 13. 中断恢复规则

如果网络中断或 Agent 重连：

1. 先运行只读检查，确认当前文件状态。
2. 不要假设上一轮已经完成。
3. 不要重复生成同名文档。
4. 优先检查 `git status --short` 和 `rg --files -g "*.md"`。
5. 继续前先向用户说明当前磁盘状态。

## 14. 默认下一步

如果用户没有指定任务，当前默认下一步是：

1. `P1-009` 建立 `persist:oj-main` 持久 session。
2. `P1-010` 到 `P1-013` 验证四个平台登录状态。
3. `P1-014` 建立 CookieVault。
4. `P1-017` 建立站点注册表。

禁止在完成 `P1-003` 前继续给旧 `BrowserView` 添加功能。
