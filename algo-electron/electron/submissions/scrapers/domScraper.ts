import type { ScrapedSubmission } from '../../shared/types'
import { nowBeijing } from '../../shared/time'
import { getAdapterForUrl } from '../../adapters/registry'
import type { SubmissionScrapeContext } from '../../adapters/types'
import { EXTRACT_GENERIC_TABLES_SCRIPT } from './GenericTableDomExtractor'
import { type GenericTableData } from './GenericTableScanner'

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
    return adapter.parseSubmissionTables((data?.tables || []) as GenericTableData[], {
      now: nowBeijing,
    })
  }

  return null
}
