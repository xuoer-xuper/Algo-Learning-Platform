# 提交规范

## 1. 总原则

Git 提交信息统一使用中文。每个提交应完成一个明确主题，不要把无关的文档、数据库、UI、浏览器核心和打包改动混在一起。

## 2. 推荐格式

```text
类型: 中文说明
```

示例：

```text
feat: 添加新站点 adapter
fix: 修复 Codeforces URL 识别
docs: 更新数据库 schema 文档
chore: 调整 Windows 打包配置
test: 添加站点解析规则测试
refactor: 抽离 BrowserHost 布局 helper
```

## 3. 类型说明

- `feat`：新增功能。
- `fix`：修复缺陷。
- `docs`：文档修改。
- `chore`：工具、配置、依赖、构建等非业务修改。
- `test`：测试相关。
- `refactor`：不改变行为的结构调整。
- `style`：样式或格式调整。
- `ci`：CI、workflow 或仓库协作配置。

## 4. 禁止格式

禁止使用无法判断范围的提交信息：

```text
update
fix bug
wip
misc
改了一点
临时提交
```

## 5. 文档同步要求

以下修改必须伴随文档更新：

- 数据库 schema 变更：更新 `docs/DATABASE_SCHEMA.md`。
- IPC / Preload API 变更：更新 `docs/ARCHITECTURE.md`、`electron/preload.ts`、`electron/electron-env.d.ts` 和相关模块 README。
- 站点适配变更：更新 `docs/SITE_ADAPTER_GUIDE.md`、`docs/submission-monitoring-design.md` 和相关 adapter README。
- Cookie 行为变更：更新 `docs/PROJECT_RULES.md`、`docs/ARCHITECTURE.md` 或 `algo-electron/electron/cookies/README.md`。
- 同步、导入导出或备份变更：更新 `docs/sync-compatibility.md` 或 `algo-electron/electron/backup/README.md`。
- 打包发布变更：更新 `docs/release-process.md`、`docs/CHANGELOG.md` 或 `algo-electron/electron-builder.json5` 相关说明。

## 6. 推荐提交粒度

好的粒度：

- `feat: 添加 AtCoder 站点 adapter`
- `fix: 修复 VJudge 弹窗提交结果关联`
- `test: 覆盖学习数据导入冲突策略`
- `docs: 同步 CookieVault 安全边界`

不好的粒度：

- 一次提交完成多个无关功能。
- 一次提交同时改数据库、UI、Cookie、AI 和打包。
- 无说明地大规模移动目录或格式化无关文件。
