# docs 目录说明

`docs/` 用来存放长期架构决策和补充说明，不是当前任务清单。

当前内容：

- `adr/0001-use-webcontentsview.md`：记录为什么项目统一使用 `WebContentsView`，并禁止继续扩展 `BrowserView`。
- `adr/0002-cookie-vault.md`：记录为什么 CookieVault 是本地一等能力，以及 Cookie 的安全边界。
- `adr/0003-event-log-and-analytics.md`：记录为什么学习行为采用“原始事件日志 + 聚合统计表”的设计。

阅读规则：

- 做普通功能任务时，优先阅读根目录文档。
- 做浏览器、Cookie、学习行为追踪等关键架构任务时，必须阅读对应 ADR。
- ADR 记录“为什么这么设计”，不替代 `TASKS.md` 的任务状态，也不替代 `ARCHITECTURE.md` / `DATABASE_SCHEMA.md` 的实现约束。

