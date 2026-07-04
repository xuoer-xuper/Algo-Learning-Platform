# DB Repositories

## 1. 职责

`electron/db/repositories/` 是 SQLite 读写函数层。每个 repository 负责一个业务域的数据访问，向 service、IPC handler 或 writer 暴露明确函数。

本目录不抓网页、不解析 OJ 结构、不注册 IPC、不做 UI 展示，也不绕过 migration 改 schema。

## 2. 当前实现程度

当前 repository：

- `accountRepository.ts`：账号 repository 兼容导出口；实际实现位于 `account/`。
- `account/`：平台账号 CRUD、当前 rating、peak rating 和 rating history。
- `problemRepository.ts`：题目 repository 兼容导出口；实际实现位于 `problem/`。
- `problem/`：题目 upsert、详情、最近题目、概览统计和删除。
- `submissionRepository.ts`：提交 repository 兼容导出口；实际实现位于 `submission/`。
- `submission/`：提交行类型、去重写入、按题目/平台查询和首次 AC 更新。
- `statsRepository.ts`：统计 repository 兼容导出口；实际实现位于 `stats/`。
- `stats/`：趋势查询、平台分布、时间线、复访、错题、未复习、连续活跃和日统计重算。
- `siteRepository.ts`：站点配置 repository 兼容导出口；实际实现位于 `site/`。
- `site/`：站点配置 CRUD、内置站点 seed、导入导出预览和确认。
- `userScriptRepository.ts`：用户脚本 repository 兼容导出口；实际实现位于 `userScript/`。
- `userScript/`：用户脚本类型、行映射、查询、CRUD 和启停。
- `aiContextSnapshotRepository.ts`：AI 上下文快照 repository 兼容导出口；实际实现位于 `aiContextSnapshot/`。
- `aiContextSnapshot/`：每日快照类型、JSON context 序列化/解析、查询和幂等创建。
- `aiOutputRepository.ts`：AI 输出 repository 兼容导出口；实际实现位于 `aiOutput/`。
- `aiOutput/`：AI 输出类型、元信息序列化、查询、保存、更新和删除。
- `cookieRecordRepository.ts`：Cookie 元数据 repository 兼容导出口；实际实现位于 `cookieRecord/`。
- `cookieRecord/`：Cookie 元数据类型、幂等保存、按站点/domain 查询和安全摘要。

## 3. 函数边界

- 事实写入函数应保持幂等或显式说明 upsert/insert 行为。
- 查询函数可以做展示聚合，但不能修改事实数据。
- 题目状态展示优先根据 submissions 实时计算，避免只依赖 `problems.status`。
- 提交写入优先通过 `SubmissionBatchWriter` 进入 `submissionRepository.ts`，由 writer 统一处理题目关联、首次 AC 和统计刷新；repository 自身只做去重插入和必要查询。
- 统计重算入口通过 `statsRepository.ts` 导出，内部实现位于 `stats/recompute.ts`；不要在 renderer 中复制统计 SQL。
- 站点配置导入入口通过 `siteRepository.ts` 导出，内部实现位于 `site/importExport.ts`；导入预览不能覆盖内置站点。
- 账号 rating history 通过 `accountRepository.ts` 导出，内部实现位于 `account/ratingHistory.ts`；重复 contest 不覆盖旧记录。
- 用户脚本 repository 只保存脚本元信息、匹配规则 JSON、兼容源码字段和本地文件路径；文件导入和 metadata 解析留在 scripts IPC/service。
- AI 输出 repository 只保存独立输出和追溯元信息，不反写题目、提交、笔记等核心事实表。
- AI context snapshot repository 只保存 `exportAIContext()` 的脱敏上下文快照；阶段总结聚合逻辑留在 `electron/ai/summary/`。
- Cookie record repository 只保存元数据和安全摘要，不保存 Cookie value，且 `sync_excluded` 必须保持为 `1`。

## 4. 边界规则

- Repository 只使用 `getDb()` 获取连接，不自己创建 `Database`。
- Schema 变化必须先写 migration，再更新 repository。
- 不在 repository 中发网络请求、执行浏览器脚本或读取 Electron session。
- 不记录 Cookie 明文、用户源码或完整请求体。
- 返回给 renderer 的对象应是普通数据，不暴露 `better-sqlite3` statement 或连接对象。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```

涉及提交或统计时追加运行 submissions 测试和相关 UI 手测。
