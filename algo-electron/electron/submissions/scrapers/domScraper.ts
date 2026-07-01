import type { SubmissionData } from '../../shared/types'
import { nowBeijing } from '../../shared/time'
import { getAdapterForUrl } from '../../adapters/registry'
import type { SubmissionScrapeContext } from '../../adapters/types'
import { EXTRACT_GENERIC_TABLES_SCRIPT } from './GenericTableDomExtractor'
import { type GenericTableData } from './GenericTableScanner'

export interface ScrapeResult {
  submissions: SubmissionData[]
  problemIds: Map<number, string>
}

export async function scrapeCurrentPage(browserHost: SubmissionScrapeContext): Promise<SubmissionData[] | null> {
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
