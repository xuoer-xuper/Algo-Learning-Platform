# 提交规范（COMMIT_RULES）

## 1. 总原则

本项目 Git 提交信息统一使用中文。

每个提交只完成一个明确任务。不要把文档、数据库、UI、浏览器核心混在一个提交里，除非它们属于同一个任务的必要产出。

## 2. 推荐格式

```text
类型: 中文说明
```

示例：

```text
feat: 迁移到 WebContentsView
fix: 修复 Codeforces URL 识别
docs: 完善全周期任务规划
chore: 初始化 TailwindCSS
test: 添加站点解析规则测试
refactor: 抽离 BrowserHost
```

## 3. 类型说明

- `feat`：新增功能。
- `fix`：修复缺陷。
- `docs`：文档修改。
- `chore`：工具、配置、依赖、构建等非业务修改。
- `test`：测试相关。
- `refactor`：不改变行为的结构调整。
- `style`：样式或格式调整。

## 4. 任务编号

如果提交对应 `TASKS.md` 中的任务，建议在提交说明中写任务编号：

```text
feat: 完成 P1-003 迁移到 WebContentsView
docs: 完成 DOC-005 架构文档
test: 完成 P5-009 站点规则测试
```

## 5. 禁止格式

禁止：

```text
update
fix bug
wip
misc
改了一点
临时提交
```

## 6. 文档同步要求

以下修改必须伴随文档更新：

- 数据库 schema 变更：更新 `DATABASE_SCHEMA.md`。
- IPC / Preload API 变更：更新 `ARCHITECTURE.md` 和 `AI_HANDOFF.md`。
- 站点适配变更：更新 `SITE_ADAPTER_GUIDE.md`。
- Cookie 行为变更：更新 `PROJECT_RULES.md` 或 `ARCHITECTURE.md`。
- 任务状态变更：更新 `TASKS.md`。

## 7. 推荐提交粒度

好的粒度：

- `docs: 完成 DOC-005 架构文档`
- `feat: 完成 P1-003 迁移到 WebContentsView`
- `feat: 完成 P1-014 添加 CookieVault 基础接口`
- `test: 完成 P1-018 Codeforces URL 解析测试`

不好的粒度：

- 一次提交完成整个 Phase 1。
- 一次提交同时改数据库、UI、Cookie、AI。
- 无说明地大规模移动目录。

## 8. AI Agent 提交建议

AI Agent 完成任务后，即使不直接提交，也必须在最终回复中给出建议提交信息。

示例：

```text
建议提交：docs: 完成长期协作文档基线
```

