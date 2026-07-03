import type { ScriptSite, UserScriptRecord } from './types'

export interface UserScriptManagerData {
  scripts: UserScriptRecord[]
  sites: ScriptSite[]
}

export async function loadUserScriptManagerData(): Promise<UserScriptManagerData> {
  const [scripts, sites] = await Promise.all([
    window.electronAPI.scriptsGetAll(),
    window.electronAPI.getAllSites(),
  ])

  return {
    scripts,
    sites,
  }
}

export async function importUserScriptFile(): Promise<string | null> {
  return window.electronAPI.scriptsImportFile()
}

export async function saveUserScriptSites(
  scriptId: string,
  name: string,
  selectedSiteIds: string[],
): Promise<string> {
  return window.electronAPI.scriptsSave(scriptId, {
    name,
    site_ids_json: JSON.stringify(selectedSiteIds),
  })
}

export async function toggleUserScript(scriptId: string, enabled: boolean): Promise<boolean> {
  return window.electronAPI.scriptsToggle(scriptId, enabled)
}

export async function deleteUserScript(scriptId: string): Promise<boolean> {
  return window.electronAPI.scriptsDelete(scriptId)
}

export function openUserScriptsFolder(): Promise<void> {
  return window.electronAPI.scriptsOpenFolder()
}
