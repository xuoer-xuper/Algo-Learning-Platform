# 发布流程

## 1. 职责

本文定义 Algo Learning Platform Windows 安装包发布前的版本、验证、打包、产物检查、安装升级卸载和回滚流程。

发布流程只处理现有 Electron 桌面应用产物。数据库 schema、IPC/Preload API、Cookie 策略、提交监测 hook 或站点 adapter 行为不应在发布打包阶段临时改动；如果必须改，先回到对应模块补代码、测试和文档，再重新进入发布流程。

## 2. 发布前置条件

进入发布前必须满足：

- 当前分支没有未解释的业务改动。
- `docs/CHANGELOG.md` 已记录本次用户可见变化。
- `algo-electron/package.json` 和 `algo-electron/package-lock.json` 顶层版本号与计划发布版本一致。
- 如有数据库 migration，已同步 `docs/DATABASE_SCHEMA.md` 和 `database-migration-rollback.md`。
- 如有 IPC/Preload API 变化，已同步类型声明、IPC contract 测试和相关 README。
- 如有提交监测变化，已同步 `submission-monitoring-design.md`、`docs/SITE_ADAPTER_GUIDE.md` 和 adapter/submissions 测试。

禁止把 Cookie、session、csrf token、用户源码、完整请求体、本机数据库、`.env` 或可复用登录态写入 changelog、issue、PR、日志、测试快照或发布说明。

## 3. 版本与变更日志

发布前按顺序处理：

1. 确认发布版本，例如 `1.0.0`。
2. 更新 `algo-electron/package.json` 的 `version`。
3. 同步 `algo-electron/package-lock.json` 顶层版本。
4. 将 `docs/CHANGELOG.md` 的“未发布”内容整理到新版本标题下。
5. 保留新的空“未发布”段，用于后续开发继续追加。

## 4. 自动验证

在 `algo-electron/` 下运行：

```powershell
npm run test:all
```

发布前建议额外确认：

```powershell
git diff --check
```

文档一致性可单独运行：

```powershell
npm run test:docs
```

打包配置可单独运行：

```powershell
npm run test:packaging
```

`test:all` 不覆盖真实 OJ 登录态、验证码、站点风控、七站正式提交或安装包安装卸载，这些仍需要人工验收。

## 5. 打包

在 `algo-electron/` 下运行：

```powershell
npm run build:win
```

当前 Windows 目标由 `electron-builder.json5` 管理：

- 输出目录：`release/${version}`。
- 目标：NSIS x64。
- 应用名：`AlgoLearningPlatform`。
- 图标目录：`build/`。
- `better-sqlite3` 原生模块通过 `asarUnpack` 解包。
- 打包输入白名单只包含 renderer 构建、主进程构建、`package.json` 和生产依赖。

新增构建产物、原生依赖、资源目录或打包入口后，必须重新检查 `electron-builder.json5`，避免把开发缓存或敏感数据带入安装包。

## 6. 产物检查

打包完成后检查：

- `release/${version}/` 存在 Windows NSIS 安装包。
- 安装包文件名包含产品名、版本号、架构和 `Setup`。
- 解包后的 app 产物不包含 `tests/`、`tmp/`、`release/`、`.env`、本地数据库、日志、Cookie 或用户源码。
- `better-sqlite3` `.node` 文件位于可加载位置，安装后启动不会因 SQLite 原生模块失败而崩溃。
- 安装包不是从未清理的旧 `release/` 目录中误取的旧版本。

如果产物检查失败，先修打包配置或构建输入，再重新运行自动验证和打包；不要手工改安装包内容。

## 7. 人工验收

安装包必须在 Windows 上手测：

- 全新安装：应用名称、图标、开始菜单、安装目录和卸载入口正常。
- 首次启动：默认首页、多标签、题库侧栏、设置页和统计页可用。
- 七站提交监测：Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode CN 的正式提交最终结果只入库一次。
- 手动同步：Codeforces API 同步和当前页面提交记录同步不重复写入。
- 核心页面：题目侧栏、题目详情、笔记弹层、统计页、设置页、用户脚本和备份导入导出无阻断问题。
- 数据保留：升级安装后用户题目、提交、笔记、站点配置和用户脚本仍在。
- 卸载：卸载程序可执行；默认不删除用户数据，符合 `electron-builder.json5` 中 `deleteAppDataOnUninstall: false`。
- 重新安装：保留数据的情况下重新启动不触发 migration 异常。

升级测试前必须备份用户数据目录；如果 migration 或启动失败，按 `database-migration-rollback.md` 处理，不要直接删除用户数据来判定通过。

## 8. 发布记录

发布前后建议记录：

```text
版本：
提交：
安装包：
自动验证：
七站手测：
安装/升级/卸载：
已知风险：
发布结论：
```

## 9. 回滚原则

已发布版本发现问题时：

- 普通 UI 或站点问题：修复后发布补丁版本。
- 打包配置问题：修正 `electron-builder.json5` 或构建输入，重新打包并重新验收。
- 数据迁移问题：按 `database-migration-rollback.md` 发布修复 migration，不在用户环境手工删 migration 记录。
- 安全或隐私问题：按 `docs/SECURITY.md` 处理，先控制敏感信息扩散，再发布修复。

不要通过修改用户本地数据库、删除用户数据或绕过站点风控来掩盖发布问题。
