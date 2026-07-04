import type { ImportPreviewSite, NewSiteDraft, SiteConfigView } from './siteManagementTypes'
import type { CodeforcesAccount, RealtimeSubmissionStatus, SettingsOverviewStats } from './settingsTypes'

export type ExportSitesResult = Awaited<ReturnType<ElectronAPI['exportSitesConfig']>>
export type ImportSitesResult = Awaited<ReturnType<ElectronAPI['importSitesConfig']>>
export type ConfirmImportSitesResult = Awaited<ReturnType<ElectronAPI['confirmImportSites']>>
export type RatingSyncResult = Awaited<ReturnType<ElectronAPI['syncCodeforcesRating']>>
export type DatabaseBackupResult = Awaited<ReturnType<ElectronAPI['createDatabaseBackup']>>
export type LearningDataExportResult = Awaited<ReturnType<ElectronAPI['exportLearningData']>>
export type LearningDataImportPreviewResult = Awaited<ReturnType<ElectronAPI['previewLearningDataImport']>>
export type LearningDataImportResult = Awaited<ReturnType<ElectronAPI['confirmLearningDataImport']>>

export function normalizeHomeUrl(rawUrl: string): string {
  const url = rawUrl.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`
  }
  return url
}

export function loadDefaultHomeUrl(): Promise<string> {
  return window.electronAPI.getDefaultHomeUrl()
}

export function saveDefaultHomeUrl(url: string): void {
  window.electronAPI.setDefaultHomeUrl(url)
}

export function loadSettingsOverviewStats(): Promise<SettingsOverviewStats> {
  return window.electronAPI.getOverviewStats()
}

export function loadRealtimeSubmissionStatus(): Promise<RealtimeSubmissionStatus | null> {
  return window.electronAPI.getRealtimeSubmissionStatus()
}

export async function loadPrimaryCodeforcesAccount(): Promise<CodeforcesAccount | null> {
  const accounts = await window.electronAPI.getAccounts('codeforces')
  return accounts[0] ?? null
}

export function syncCodeforcesSubmissions(handle: string): Promise<SyncResult> {
  return window.electronAPI.syncCodeforces(handle)
}

export async function syncCodeforcesRatingProfile(handle: string): Promise<{
  result: RatingSyncResult
  account: CodeforcesAccount | null
}> {
  await window.electronAPI.bindHandle('codeforces', handle)
  const result = await window.electronAPI.syncCodeforcesRating(handle)
  const account = result.success
    ? await window.electronAPI.getAccount('codeforces', handle)
    : null

  return { result, account }
}

export function loadSites(): Promise<SiteConfigView[]> {
  return window.electronAPI.getAllSites()
}

export function toggleSiteEnabled(id: string, enabled: boolean): Promise<boolean> {
  return window.electronAPI.toggleSite(id, enabled)
}

export function deleteSiteConfig(id: string): Promise<boolean> {
  return window.electronAPI.deleteSite(id)
}

export function exportSitesConfig(): Promise<ExportSitesResult> {
  return window.electronAPI.exportSitesConfig()
}

export function importSitesConfig(): Promise<ImportSitesResult> {
  return window.electronAPI.importSitesConfig()
}

export function confirmImportSites(sites: ImportPreviewSite[], overwriteIds: string[]): Promise<ConfirmImportSitesResult> {
  return window.electronAPI.confirmImportSites(sites, overwriteIds)
}

export function loadSiteById(id: string): Promise<SiteConfigView | null> {
  return window.electronAPI.getSiteById(id)
}

export function createSiteFromDraft(id: string, name: string, draft: NewSiteDraft): Promise<string> {
  const domains = draft.domains.split(',').map((domain) => domain.trim()).filter(Boolean)
  const problemUrlPatterns = draft.patterns.split(',').map((pattern) => pattern.trim()).filter(Boolean)

  return window.electronAPI.createSite({
    id,
    name,
    domains,
    homeUrl: draft.homeUrl.trim(),
    enabled: true,
    problemUrlPatterns,
  })
}

export function createDatabaseBackup(): Promise<DatabaseBackupResult> {
  return window.electronAPI.createDatabaseBackup()
}

export function exportLearningData(): Promise<LearningDataExportResult> {
  return window.electronAPI.exportLearningData()
}

export function previewLearningDataImport(): Promise<LearningDataImportPreviewResult> {
  return window.electronAPI.previewLearningDataImport()
}

export function confirmLearningDataImport(overwriteConflicts: boolean): Promise<LearningDataImportResult> {
  return window.electronAPI.confirmLearningDataImport(overwriteConflicts)
}
