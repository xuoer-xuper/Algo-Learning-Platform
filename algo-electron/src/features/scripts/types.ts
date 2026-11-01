/**
 * 脚本管理面板的站点关联视图（列表行内展示用）。
 * UserScriptRecord 已收口到 @shared/types/scripts（阶段 2 R2 删除手抄副本）。
 */
export interface ScriptSite {
  id: string
  name?: string | null
  homeUrl?: string | null
}
