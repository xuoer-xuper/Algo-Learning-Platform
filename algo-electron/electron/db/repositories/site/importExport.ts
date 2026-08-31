import { nowBeijing } from '../../../shared/time'
import { createSite, getAllSites, getSiteById, updateSite } from './crud'
import type { ImportConflict, ImportPreview, ImportPreviewResult, SiteConfigData, SitesExportData } from './types'
import { parseImportedSite } from './types'

export function exportSitesConfig(): SitesExportData {
  return {
    version: 1,
    exportedAt: nowBeijing(),
    sites: getAllSites(),
  }
}

export function previewImportSites(data: unknown): ImportPreviewResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '无效的配置数据' }
  }

  const payload = data as { version?: unknown; sites?: unknown }
  if (payload.version !== 1) {
    return { valid: false, error: `不支持的配置版本: ${payload.version}` }
  }

  if (!Array.isArray(payload.sites)) {
    return { valid: false, error: '配置数据缺少 sites 字段' }
  }

  const preview: ImportPreview = {
    newSites: [],
    conflicts: [],
    builtinSkipped: [],
  }

  for (const rawSite of payload.sites) {
    const site = parseImportedSite(rawSite)
    if (!site) continue

    const existing = getSiteById(site.id)
    if (existing) {
      if (existing.isBuiltin) {
        preview.builtinSkipped.push(site)
      } else {
        preview.conflicts.push({ id: site.id, name: site.name, existing, incoming: site } satisfies ImportConflict)
      }
    } else {
      preview.newSites.push(site)
    }
  }

  return { valid: true, preview }
}

/**
 * 提交导入。
 *
 * 内置站点在这里**再判一次**，不是重复劳动：`previewImportSites` 会把命中内置站点的项
 * 路由进 `builtinSkipped`，但那只是预览侧的结论——本函数拿到的是渲染进程回传的数组，
 * 中间没有任何一环强制它等于刚才那份预览。`updateSite` 自己不看 `is_builtin`，于是一份
 * 把内置站点 id 同时写进 `sites` 与 `overwriteIds` 的载荷，能覆盖掉内置站点行。
 *
 * 通道上的形状校验拦不住这个：id 和字段形状都是合法的，越权发生在语义层。
 */
export function confirmImportSites(sites: SiteConfigData[], overwriteIds: string[]): { imported: number; overwritten: number } {
  let imported = 0
  let overwritten = 0

  for (const site of sites) {
    const isOverwrite = overwriteIds.includes(site.id)
    if (isOverwrite) {
      if (getSiteById(site.id)?.isBuiltin) continue
      const ok = updateSite(site.id, site)
      if (ok) overwritten++
    } else {
      try {
        createSite(site)
        imported++
      } catch {
        // Duplicate custom site imports are skipped so one bad item does not abort the whole import.
      }
    }
  }

  return { imported, overwritten }
}
