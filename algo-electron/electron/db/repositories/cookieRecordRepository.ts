export type { CookieMetadataInput, CookieRecord } from './cookieRecord/types'

// Cookie 概要是跨进程类型（阶段 2 R2 收口），单一来源在 shared。
export type {
  CookieSafeDomainSummary,
  CookieSafeSiteSummary,
} from '../../../src/shared/types/cookies'

export {
  buildCookieDomainSummary,
  getCookieRecordsByDomain,
  getCookieRecordsBySite,
  getCookieSummaryByDomain,
  getCookieSummaryBySite,
} from './cookieRecord/queries'

export {
  deleteCookieMetadataForDomain,
  replaceCookieMetadataForDomain,
  upsertCookieMetadata,
  upsertCookieMetadataBatch,
} from './cookieRecord/mutations'
