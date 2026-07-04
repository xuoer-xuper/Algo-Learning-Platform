# 故障排查手册

## 1. 使用边界

本文面向用户和后续 Agent，目标是在不阅读源码的情况下定位常见运行问题。

排查时禁止记录或粘贴：

- Cookie、session、csrf token、Authorization 等登录态。
- 用户提交源码、完整请求体、完整页面 HTML。
- 本机绝对路径中包含的隐私信息。

需要共享证据时，优先提供站点名、页面 URL、平台提交 ID、时间点、错误类型、诊断面板文本和脱敏截图。

## 2. 数据位置

应用数据根目录来自 Electron `app.getPath('userData')`。常见 Windows 打包环境通常在 `%APPDATA%\AlgoLearningPlatform`，开发环境可能随 Electron 应用名变化。

关键数据：

- SQLite 数据库：`<userData>/data/algo-learning.sqlite`
- SQLite WAL/SHM：`<userData>/data/algo-learning.sqlite-wal`、`<userData>/data/algo-learning.sqlite-shm`
- 配置文件：`<userData>/config.json`
- 笔记目录：`<userData>/notes`
- 用户脚本目录：`<userData>/userscripts`

任何涉及数据库、笔记或脚本恢复的操作，先关闭应用并备份整个 `<userData>` 目录。

## 3. 通用排查步骤

1. 确认应用版本、运行方式和当前页面 URL。
2. 关闭应用，备份 `<userData>` 目录。
3. 如果是开发环境，先运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npm run lint
npx --yes tsx tests\electron\startupSmoke.test.ts
```

4. 如果是提交监测问题，打开设置里的实时提交诊断面板，记录最新的 IPC、页面识别、hook 注入、提交检测状态。
5. 若问题和数据库有关，先按 [database-migration-rollback.md](database-migration-rollback.md) 做备份和恢复，不要直接编辑真实数据库。

## 4. 登录失败或 Cookie 失效

现象：

- OJ 页面显示未登录。
- 提交记录页跳到登录页。
- 同步接口返回登录态失效、403、401。

处理：

1. 在内嵌浏览器里打开对应 OJ 首页，手动登录。
2. 完成验证码、二次验证或 Cloudflare 校验后，刷新题目页。
3. 确认站点未在设置中禁用。
4. 重新打开题目页再提交或同步。

注意：

- 不要导出或粘贴 Cookie。
- Cookie 默认只留在本机持久 session 中。
- 如果某站反复要求验证，优先用普通浏览器确认账号没有被风控，再回到应用登录。

## 5. 页面打不开或反复跳转

现象：

- 内嵌浏览器空白、加载很慢、重复跳登录页。
- Codeforces/Nowcoder/VJudge 等站点偶发打不开。

处理：

1. 用系统浏览器打开同一 URL，确认不是站点自身故障。
2. 在应用内点刷新，或新建标签页重新打开。
3. 检查默认首页配置是否是有效 URL。
4. 开发环境运行 `startupSmoke.test.ts`，确认 Electron 容器和 preload 可用。
5. 如果只在某站失败，查看该站 README 和 `docs/SITE_ADAPTER_GUIDE.md`，确认 URL 模式仍受支持。

## 6. 提交监测没有记录

现象：

- 提交后题目详情没有新增记录。
- 诊断面板显示 `No final submission parsed`、未注入 hook 或站点未识别。

处理：

1. 确认页面是支持站点题目页，而不是题解、排行榜、公开状态页。
2. 确认设置中该站点启用。
3. 提交后等待最终评测结果，不要只看 pending/judging。
4. 对 Nowcoder/VJudge，确认是正式提交，不是自测、样例运行或公开状态行。
5. 如果最终仍未写入，记录诊断面板中：
   - 页面识别站点。
   - hook 注入状态。
   - 提交检测结果。
   - 页面 URL 和平台提交 ID。

验证命令：

```powershell
cd algo-electron
npx --yes tsx tests\submissions\realtimeTabActivation.test.ts
npx --yes tsx tests\adapters\genericTableSiteAdapters.test.ts
npx --yes tsx tests\adapters\specializedScraperSiteAdapters.test.ts
```

## 7. 提交记录重复或错误

现象：

- 查看提交记录页后重复写入。
- 自测结果被写入。
- pending/judging 被当成最终结果。

处理：

1. 先不要删除数据库，记录平台、提交 ID、题目 URL、实际 verdict。
2. 确认是否为 Nowcoder/VJudge：
   - Nowcoder 正式实时结果只应接受网络 `judge-status` 等 payload。
   - VJudge 只应接受正式提交接口和强关联的状态/solution 结果。
3. 确认提交 ID 是否相同。相同 ID 应由 `submissionRepository` 去重。
4. 运行 DB 和提交写入测试：

```powershell
cd algo-electron
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
node node_modules\esbuild\bin\esbuild tests\submissions\submissionBatchWriter.test.ts --bundle --platform=node --format=esm --outfile=tmp\submissions-submissionBatchWriter.test.mjs
node tmp\submissions-submissionBatchWriter.test.mjs
```

## 8. 手动同步失败

现象：

- Codeforces 同步失败。
- 当前页同步没有抓到提交。
- VJudge 同步无结果。

处理：

1. 确认已登录目标站点。
2. 打开该站提交记录页，确认页面本身能显示数据。
3. 对 Codeforces，确认 handle 正确，且 Codeforces API 可访问。
4. 对当前页同步，确认当前页是提交记录页或题目相关提交页。
5. 如果是页面结构变化，优先补 adapter/scraper 测试，再改 scraper。

## 9. 数据库损坏或迁移失败

现象：

- 应用启动后空白或直接退出。
- 控制台出现 SQLite、migration、schema_migrations、database disk image is malformed。
- 更新后数据消失或统计异常。

处理：

1. 关闭应用。
2. 备份 `<userData>` 整个目录。
3. 按 [database-migration-rollback.md](database-migration-rollback.md) 检查 `schema_migrations`、备份和恢复。
4. 不要直接删除 `.sqlite`，除非已确认备份可恢复。
5. 如果只是统计异常，优先运行统计重算功能或 `stats:recomputeAll` 对应入口，不要手改事实表。

## 10. 笔记或图片丢失

现象：

- 题目详情里的笔记列表为空。
- Markdown 内容存在但图片显示失败。

处理：

1. 确认 `<userData>/notes` 目录存在。
2. 确认数据库 `notes` 表仍有记录。
3. 检查图片文件是否仍在笔记附件目录。
4. 如果移动过数据目录，必须整体移动 `<userData>`，不要只移动数据库。
5. 不要手动改 `note-asset://` URL；需要通过笔记模块保存图片。

## 11. 用户脚本不生效

现象：

- 导入脚本后页面没有效果。
- 只在部分站点生效。

处理：

1. 确认脚本已启用。
2. 确认脚本 `@match` / `@include` 或绑定站点覆盖当前 URL。
3. 打开脚本管理器确认 `file_path` 指向的文件仍存在。
4. 如果是 `@require` 或 `@resource` 失败，确认网络可访问这些资源。
5. 运行 metadata 测试：

```powershell
cd algo-electron
npx --yes tsx tests\scripts\userScriptMetadata.test.ts
```

## 12. 统计页异常

现象：

- 平台分布图错位。
- 趋势图数据为空。
- 错题/未复习列表不符合预期。

处理：

1. 确认数据库中有题目访问、提交或 daily stats 数据。
2. 运行日统计重算。
3. 开发环境运行 UI 截图测试：

```powershell
cd algo-electron
npx --yes tsx tests\ui\rendererScreenshots.test.ts
```

4. 如果只有某平台缺失，检查该平台提交是否已关联题目。

## 13. 打包或安装包问题

现象：

- `npm run build:win` 失败。
- 安装包启动后 `better-sqlite3` 加载失败。
- 安装包包含测试、tmp、release 或本地数据。

处理：

1. 运行：

```powershell
cd algo-electron
npm run build:win
```

2. 确认 `electron-builder.json5` 中 `better-sqlite3` 原生模块仍在 `asarUnpack`。
3. 确认打包输入白名单没有包含 `tests/`、`tmp/`、`release/`、本地数据库或 `.env`。
4. 安装包运行失败时，先用开发环境 `startupSmoke.test.ts` 排除基础启动问题。

## 14. 向 Agent 提交问题时需要提供

最小信息：

- 问题类型：登录、提交监测、同步、数据库、笔记、脚本、统计、打包。
- 站点和 URL。
- 发生时间。
- 预期行为和实际行为。
- 是否能在系统浏览器复现。
- 脱敏截图或诊断面板文字。
- 最近一次通过的提交 ID 或应用版本。

不要提供 Cookie、源码、完整请求体或可复用登录态。
