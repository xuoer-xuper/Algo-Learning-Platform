# Submission Scrapers

## 1. 职责

`electron/submissions/scrapers/` 负责“手动同步当前页面”场景下的页面数据提取和表格扫描。它把当前页面 DOM 或站点专用数据转换成 `SubmissionData[]`，再交给 `SubmissionBatchWriter` 写入。

本目录不处理实时 submit intent，不注册 IPC，不写数据库，不管理 Cookie。

## 2. 当前实现程度

- `domScraper.ts`：当前页面抓取入口，按站点选择通用表格或专用 scraper。
- `GenericTableDomExtractor.ts`：页面内执行脚本，提取表头、单元格、链接和文本。
- `GenericTableScanner.ts`：通用提交表扫描兼容入口。
- `genericTableTypes.ts`：通用表格、行和扫描选项类型。
- `genericTableColumns.ts`：提交表列识别、verdict 列推断和最佳表评分。
- `genericTableIds.ts`：提交 ID 提取，优先 ID 列，其次 rowId 和链接。
- `genericTableValueParsers.ts`：verdict、运行时间、内存和文本清理。
- `ptaScraper.ts`：PTA 专用提交记录、实时 verdict payload 和问题 ID 解析。
- `luoguScraper.ts`：洛谷 `_contentOnly=1`/页面数据提交记录解析。

## 3. 核心封装

- `EXTRACT_GENERIC_TABLES_SCRIPT`：提取当前页面通用表格结构。
- `hasSubmissionLikeTable(table)`：判断表格是否像提交记录。
- `selectBestSubmissionTable(tables)`：选择最可信提交表。
- `scanGenericSubmissionTable(table, options)`：扫描通用提交表。
- `getGenericTableColumnIndexes(table)`：按表头和内容推断 ID、verdict、语言、时间和内存列。
- `extractGenericSubmissionId(row, idText, options)`：生成平台内稳定提交 ID。
- `normalizeGenericVerdict(raw)`：归一化通用表格 verdict。
- `EXTRACT_PTA_SUBMISSIONS_SCRIPT`、`parsePtaSubmissionData(...)`：PTA 专用抓取。
- `parsePtaFrontendVerdictPayload(raw)`：PTA 实时结果解析，供 PTA adapter 使用。
- `EXTRACT_LUOGU_SUBMISSIONS_SCRIPT`、`parseLuoguSubmissionData(...)`：洛谷专用抓取。

## 4. 边界规则

- scraper 用于手动同步或专用页面抓取，不替代实时提交网络监听。
- 打开提交记录页导致的手动同步可以写历史记录，但不能伪造一次实时提交。
- 通用表格扫描只能解析可信提交表，无法确认平台/题目/用户时应少写或不写。
- 通用表格 helper 只处理表格结构和字段归一化，不做题目关联；题目关联统一由 `SubmissionBatchWriter` / `SubmissionProblemAttacher` 处理。
- 页面脚本不得读取 Cookie、用户源码或完整请求体。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\submissions\genericTableScanner.test.ts
npx --yes tsx tests\submissions\domScraperGenericIntegration.test.ts
npx --yes tsx tests\adapters\specializedScraperSiteAdapters.test.ts
```
