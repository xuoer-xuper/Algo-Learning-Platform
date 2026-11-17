/**
 * 新建站点表单的草稿：domains / patterns 还是逗号分隔的原始输入，
 * 由 settingsApi.createSiteFromDraft 拆成数组（收口前本文件还手抄了
 * SiteConfigView / ImportPreviewSite / ImportConflict / ImportPreview 四份，
 * 阶段 2 R2 删除，单一来源在 @shared/types/sites）。
 */
export interface NewSiteDraft {
  id: string
  name: string
  domains: string
  homeUrl: string
  patterns: string
}
