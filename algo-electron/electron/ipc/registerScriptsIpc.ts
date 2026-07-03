import { app, dialog, ipcMain, shell } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  createScript,
  deleteScript,
  getAllScripts,
  toggleScript,
  updateScript,
  type UserScript,
} from '../db/repositories/userScriptRepository'
import { parseScriptMetadata } from '../scripts/userScriptMetadata'

type NewUserScript = Omit<UserScript, 'id' | 'created_at' | 'updated_at'>

export function registerScriptsIpc(): void {
  ipcMain.handle('scripts:getAll', () => {
    return getAllScripts()
  })

  ipcMain.handle('scripts:save', (_event, id: string | null, data: Partial<NewUserScript>) => {
    if (id) {
      updateScript(id, data)
      return id
    }

    return createScript(data as NewUserScript)
  })

  ipcMain.handle('scripts:importFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择用户脚本',
      filters: [{ name: 'JavaScript', extensions: ['js', 'user.js'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return null

    const srcPath = filePaths[0]
    const code = fs.readFileSync(srcPath, 'utf-8')
    const meta = parseScriptMetadata(code)

    const scriptsDir = path.join(app.getPath('userData'), 'userscripts')
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true })
    }

    const newFilename = `${crypto.randomUUID()}.js`
    const destPath = path.join(scriptsDir, newFilename)
    fs.copyFileSync(srcPath, destPath)

    return createScript({
      name: meta.name || path.basename(srcPath),
      description: meta.description || '',
      version: meta.version || '1.0',
      match_urls_json: JSON.stringify(meta.matches),
      code: '',
      file_path: destPath,
      site_ids_json: '[]',
      enabled: true,
    })
  })

  ipcMain.handle('scripts:openFolder', () => {
    const scriptsDir = path.join(app.getPath('userData'), 'userscripts')
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true })
    }
    return shell.openPath(scriptsDir)
  })

  ipcMain.handle('scripts:toggle', (_event, id: string, enabled: boolean) => {
    return toggleScript(id, enabled)
  })

  ipcMain.handle('scripts:delete', (_event, id: string) => {
    return deleteScript(id)
  })
}
