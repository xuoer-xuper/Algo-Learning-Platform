import type { UserScriptRecord } from '@shared/types/scripts'
import type { ScriptSite } from './types'
import type {
  UserScriptCodeView,
  UserScriptOpenEditorResult,
  UserScriptUpdateSummary,
} from '@shared/types/scripts'

export interface UserScriptManagerData {
  scripts: UserScriptRecord[]
  sites: ScriptSite[]
}

export async function loadUserScriptManagerData(): Promise<UserScriptManagerData> {
  const [scripts, sites] = await Promise.all([
    window.api.scripts.getAll(),
    window.api.sites.getAll(),
  ])

  return {
    scripts,
    sites,
  }
}

export async function importUserScriptFile(): Promise<string | null> {
  return window.api.scripts.importFile()
}

export async function saveUserScriptSites(
  scriptId: string,
  name: string,
  selectedSiteIds: string[],
): Promise<string> {
  return window.api.scripts.save({
    id: scriptId,
    data: {
      name,
      site_ids_json: JSON.stringify(selectedSiteIds),
    },
  })
}

export async function toggleUserScript(scriptId: string, enabled: boolean): Promise<boolean> {
  return window.api.scripts.toggle({ id: scriptId, enabled })
}

export async function deleteUserScript(scriptId: string): Promise<boolean> {
  return window.api.scripts.delete(scriptId)
}

export function openUserScriptsFolder(): Promise<string> {
  return window.api.scripts.openFolder()
}

export function getUserScriptCode(scriptId: string): Promise<UserScriptCodeView> {
  return window.api.scripts.getCode(scriptId)
}

export function openUserScriptEditor(scriptId: string): Promise<UserScriptOpenEditorResult> {
  return window.api.scripts.openEditor(scriptId)
}

const CODE_VIEW_MESSAGES: Record<Exclude<UserScriptCodeView['status'], 'ok'>, string> = {
  'not-found': '脚本已不存在，请返回列表刷新。',
  unmanaged: '该脚本文件不在应用托管目录内，无法在此查看。',
  unreadable: '源文件读取失败，可能已被移动或删除。',
  'too-large': '源码超过 4 MiB，未在此展示；请用系统编辑器打开。',
}

export function describeUserScriptCodeView(view: UserScriptCodeView): string | null {
  return view.status === 'ok' ? null : CODE_VIEW_MESSAGES[view.status]
}

const OPEN_EDITOR_MESSAGES: Record<Exclude<UserScriptOpenEditorResult['status'], 'ok'>, string> = {
  'not-found': '脚本已不存在，请返回列表刷新。',
  unmanaged: '只有应用托管的本地脚本可以用系统编辑器打开。',
  'open-failed': '系统未能打开该文件，请检查默认打开方式。',
}

export function describeUserScriptOpenEditorResult(
  result: UserScriptOpenEditorResult,
): string | null {
  return result.status === 'ok' ? null : OPEN_EDITOR_MESSAGES[result.status]
}

export function checkUserScriptUpdates(): Promise<UserScriptUpdateSummary | null> {
  return window.api.scripts.checkUpdates()
}
