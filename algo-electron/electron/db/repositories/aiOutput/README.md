# AI Output Repository

## 1. 职责

`electron/db/repositories/aiOutput/` 是 `aiOutputRepository.ts` 的内部实现目录，负责 `ai_outputs` 表的保存、读取、列表、更新和删除。

本目录只保存 AI 输出结果和可追溯元信息，不生成复习建议、不聚合学习上下文、不调用模型，也不修改 `problems`、`submissions`、`notes` 等核心事实表。

## 2. 当前实现程度

- `types.ts`：AI 输出类型、保存输入、元信息对象和更新输入类型。
- `serialization.ts`：把保存输入序列化为数据库记录，包括 `input_summary_json`、`source_refs_json` 和 `model_info_json`。
- `queries.ts`：按 ID 读取和按类型/数量列出输出。
- `mutations.ts`：保存、更新和删除 AI 输出。
- `../aiOutputRepository.ts`：兼容导出口，外部调用方继续从原路径 import。

## 3. 封装函数

- 查询：`getAIOutput(id)`、`listAIOutputs(outputType?, limit?)`。
- 写入：`saveAIOutput(input)`、`updateAIOutput(id, updates)`、`deleteAIOutput(id)`。
- 序列化：`buildAIOutputRecord(id, now, input)`。

## 4. 边界规则

- AI 输出属于独立输出区，不应反写核心事实表。
- `content` 保存结构化 JSON 字符串，`content_markdown` 保存渲染结果。
- `input_summary`、`source_refs`、`model_info` 只保存摘要和引用，不能包含 Cookie、源码正文、绝对路径、完整请求体或可复用登录态。
- Repository 不校验 AI 输出业务含义；生成逻辑留在 `electron/ai/` 的规则引擎和渲染层。
- Schema 变化必须先写 migration，再同步 `docs/DESIGN/DATABASE_SCHEMA.md` 和本目录 SQL。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
node node_modules\esbuild\bin\esbuild tests\db\repositories.test.ts --bundle --platform=node --format=esm --external:better-sqlite3 --external:electron --outfile=tmp\db-repositories.test.mjs
$env:ELECTRON_RUN_AS_NODE='1'; node_modules\.bin\electron.cmd tmp\db-repositories.test.mjs
```
