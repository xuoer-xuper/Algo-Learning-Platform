import type { ScrapedSubmission } from '../../shared/types'
import { nowBeijing } from '../../shared/time'
import { getAdapterForUrl } from '../../adapters/registry'
import type { SubmissionScrapeContext } from '../../adapters/types'
import { EXTRACT_GENERIC_TABLES_SCRIPT } from './GenericTableDomExtractor'
import { type GenericTableData } from './GenericTableScanner'

/**
 * 从注入脚本的返回值里取出表格数组。
 *
 * `executeScript` 的结果是页面里的代码算出来的——跨进程结构化克隆过来，主进程这边无法
 * 假定它长什么样：页面可能因为选择器失配返回 `undefined`，用户脚本也可能改了 DOM。
 * 此前这里写的是 `(data?.tables || []) as GenericTableData[]`，`Promise<any>` 让
 * `data?.tables` 这个不存在的属性访问也能编译通过。
 *
 * 只做形状收窄，不逐行校验：下游 `GenericTableScanner` 本来就按缺列/空值容错设计。
 */
function readExtractedTables(data: unknown): GenericTableData[] {
  if (!data || typeof data !== 'object') return []
  const tables = (data as { tables?: unknown }).tables
  return Array.isArray(tables) ? tables as GenericTableData[] : []
}

/**
 * 返回 `ScrapedSubmission[]`：站点适配器解析时顺手拿到的题目线索要一路带到
 * `SubmissionProblemAttacher` 才被消费，这里收窄成 `SubmissionData[]` 会把线索
 * 的类型抹掉，下游只能靠 `as any` 捞回来。线索在 `upsertSubmission` 之前丢弃，不入库。
 */
export async function scrapeCurrentPage(browserHost: SubmissionScrapeContext): Promise<ScrapedSubmission[] | null> {
  const url = browserHost.getUrl()
  const adapter = getAdapterForUrl(url)
  if (!adapter) return null

  if (adapter.scrapeSubmissions) {
    return adapter.scrapeSubmissions(browserHost)
  }

  if (adapter.parseSubmissionTables) {
    const data = await browserHost.executeScript(EXTRACT_GENERIC_TABLES_SCRIPT)
    return adapter.parseSubmissionTables(readExtractedTables(data), { now: nowBeijing })
  }

  return null
}
