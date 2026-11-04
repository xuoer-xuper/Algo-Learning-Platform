import type { NewSiteDraft } from './siteManagementTypes'
import type { PlatformAccount } from '@shared/types/rating'
import type { SiteConfigRecord } from '@shared/types/sites'
import type { RealtimeSubmissionStatus } from '@shared/types/submission'
import type { OverviewStats } from '@shared/types/stats'
import type {
  DatabaseBackupResult,
  LearningDataImportPreviewResult,
  LearningDataImportResult,
} from '@shared/types/backup'
import type { SearchEngineConfig, ThemePreference } from '@shared/types/config'
import type { SyncResult } from '@shared/types/submission'
import type { CredentialSummary } from '@shared/types/credentials'
import type { CookieSafeSiteSummary } from '@shared/types/cookies'
import type { LlmConfigStatus, LlmConnectionTestOutput } from '@shared/types/coach'

/*
 * 返回类型从 `window.api` 推导（R3 起 preload 的 `typeof api` 是唯一权威；
 * 原先引 `ElectronAPI['…']`，该接口已随 preload 重写删除）。
 */
export type ExportSitesResult = Awaited<ReturnType<typeof window.api.sites.exportConfig>>
export type ImportSitesResult = Awaited<ReturnType<typeof window.api.sites.importConfig>>
export type ConfirmImportSitesResult = Awaited<ReturnType<typeof window.api.sites.confirmImport>>
export type RatingSyncResult = Awaited<ReturnType<typeof window.api.rating.syncCodeforces>>
export type LearningDataExportResult = Awaited<
  ReturnType<typeof window.api.backup.exportLearningData>
>

export function loadSearchEngine(): Promise<SearchEngineConfig> {
  return window.api.config.getSearchEngine()
}

export function saveSearchEngine(search: SearchEngineConfig): Promise<SearchEngineConfig> {
  return window.api.config.setSearchEngine(search)
}

export function loadThemePreference(): Promise<ThemePreference> {
  return window.api.config.getTheme()
}

export function saveThemePreference(theme: ThemePreference): Promise<ThemePreference> {
  return window.api.config.setTheme(theme)
}

export function loadSettingsOverviewStats(): Promise<OverviewStats> {
  return window.api.stats.getOverview()
}

export function loadRealtimeSubmissionStatus(): Promise<RealtimeSubmissionStatus | null> {
  return window.api.submissions.getRealtimeStatus()
}

export async function loadPrimaryCodeforcesAccount(): Promise<PlatformAccount | null> {
  const accounts = await window.api.rating.getAccounts('codeforces')
  return accounts[0] ?? null
}

export function loadCodeforcesAccount(handle: string): Promise<PlatformAccount | null> {
  return window.api.rating.getAccount({ platform: 'codeforces', handle })
}

export function syncCodeforcesSubmissions(handle: string): Promise<SyncResult> {
  return window.api.submissions.syncCodeforces(handle)
}

export async function syncCodeforcesRatingProfile(handle: string): Promise<{
  result: RatingSyncResult
  account: PlatformAccount | null
}> {
  await window.api.rating.bindHandle({ platform: 'codeforces', handle })
  const result = await window.api.rating.syncCodeforces(handle)
  const account =
    result.success === true
      ? await window.api.rating.getAccount({ platform: 'codeforces', handle })
      : null

  return { result, account }
}

export function loadSites(): Promise<SiteConfigRecord[]> {
  return window.api.sites.getAll()
}

export function loadCredentialSummaries(siteId?: string): Promise<CredentialSummary[]> {
  return window.api.credentials.list(siteId)
}

/** 站点 Cookie 概要。只含存在性与过期信息，不含 Cookie 值。 */
export function loadCookieSummaryForSite(siteId: string): Promise<CookieSafeSiteSummary> {
  return window.api.cookies.getSiteSummary(siteId)
}

export function renameCredential(
  credentialId: string,
  displayName: string,
): Promise<CredentialSummary | null> {
  return window.api.credentials.rename({ credentialId, displayName })
}

export function deleteSavedCredential(credentialId: string): Promise<boolean> {
  return window.api.credentials.delete(credentialId)
}

export function openCredentialLoginPage(url: string): Promise<string> {
  return window.api.tab.create(url)
}

export function toggleSiteEnabled(id: string, enabled: boolean): Promise<boolean> {
  return window.api.sites.toggle({ id, enabled })
}

export function deleteSiteConfig(id: string): Promise<boolean> {
  return window.api.sites.delete(id)
}

export function exportSitesConfig(): Promise<ExportSitesResult> {
  return window.api.sites.exportConfig()
}

export function importSitesConfig(): Promise<ImportSitesResult> {
  return window.api.sites.importConfig()
}

export function confirmImportSites(
  sites: SiteConfigRecord[],
  overwriteIds: string[],
): Promise<ConfirmImportSitesResult> {
  return window.api.sites.confirmImport({ sites, overwriteIds })
}

export function loadSiteById(id: string): Promise<SiteConfigRecord | null> {
  return window.api.sites.getById(id)
}

export function createSiteFromDraft(
  id: string,
  name: string,
  draft: NewSiteDraft,
): Promise<string> {
  const domains = draft.domains
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean)
  const problemUrlPatterns = draft.patterns
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean)

  return window.api.sites.create({
    id,
    name,
    domains,
    homeUrl: draft.homeUrl.trim(),
    enabled: true,
    problemUrlPatterns,
  })
}

export function createDatabaseBackup(): Promise<DatabaseBackupResult> {
  return window.api.backup.createDatabaseBackup()
}

export function exportLearningData(): Promise<LearningDataExportResult> {
  return window.api.backup.exportLearningData()
}

export function previewLearningDataImport(): Promise<LearningDataImportPreviewResult> {
  return window.api.backup.previewLearningDataImport()
}

export function confirmLearningDataImport(
  overwriteConflicts: boolean,
): Promise<LearningDataImportResult> {
  return window.api.backup.confirmLearningDataImport(overwriteConflicts)
}

// --- LLM 配置 ---

export function loadLlmConfig(): Promise<LlmConfigStatus | null> {
  return window.api.coach.getLlmConfig()
}

export function saveLlmApiKey(apiKey: string): Promise<boolean> {
  return window.api.coach.saveLlmApiKey(apiKey)
}

export function saveLlmConfig(partial: {
  base_url?: string
  model?: string
  enabled?: boolean
}): Promise<boolean> {
  return window.api.coach.saveLlmConfig(partial)
}

export function testLlmConnection(config: {
  api_key: string
  base_url: string
  model: string
}): Promise<LlmConnectionTestOutput> {
  return window.api.coach.testLlmConnection(config)
}
