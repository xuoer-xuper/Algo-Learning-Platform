# AI Context Snapshot Repository

## 1. 职责

`electron/db/repositories/aiContextSnapshot/` 是 `aiContextSnapshotRepository.ts` 的内部实现目录，负责 `ai_context_snapshots` 表的每日快照创建、读取、列表和 JSON context 解析。

本目录不定义 AI 上下文 schema、不生成阶段总结、不修改题目/提交/笔记事实数据。上下文聚合由 `electron/ai/contextExporter.ts` 提供，周期总结读取本 repository 的快照。

## 2. 当前实现程度

- `types.ts`：快照原始行、快照元数据和解析后快照类型。
- `serialization.ts`：把 `AIContextExport` 序列化成 `context_json`，以及把快照行解析为带 `context` 的对象。
- `queries.ts`：按日期读取原始行、按日期读取解析后快照、列出最近快照元数据。
- `mutations.ts`：`ensureTodaySnapshot()` 幂等生成当日快照。
- `../aiContextSnapshotRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 写入：`ensureTodaySnapshot()`。
- 查询：`getSnapshotByDate(date)`、`listSnapshots(limit?)`。
- 内部查询：`getSnapshotRowByDate(date)`。
- 序列化：`buildAIContextSnapshotRecord(options)`、`attachParsedContext(snapshot)`。

## 4. 边界规则

- `ensureTodaySnapshot()` 只在当天没有快照时写入；已有快照直接返回，不覆盖历史。
- `context_json` 只保存 `exportAIContext()` 的脱敏输出，不应包含 Cookie、源码正文、绝对路径、完整请求体或可复用登录态。
- `listSnapshots()` 只返回元数据，不返回完整 `context_json`。
- 快照 schema 版本来自 `AI_CONTEXT_VERSION`，schema 变化必须同步 context exporter、migration/文档和相关测试。
- Repository 不做阶段总结聚合；周期统计逻辑留在 `electron/ai/summary/`。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
