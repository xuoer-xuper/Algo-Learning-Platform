import assert from 'node:assert/strict'
import { beforeEach, test } from 'vitest'
import { ipcMain } from 'electron'
import { MockBrowserWindow, MockWebContents, resetElectronMock } from '../electron/electronMock'
import { registerSubmissionsIpc } from '../../electron/ipc/registerSubmissionsIpc.ts'
import { registerShellWebContents, resetTrustedSenderRegistry } from '../../electron/ipc/trustedSender.ts'
import type { SyncService } from '../../electron/submissions/syncService.ts'
import { AppWindow } from '../../electron/windows/AppWindow.ts'

beforeEach(() => {
  resetElectronMock()
  resetTrustedSenderRegistry()
})

test('routes DOM submission sync to the trusted sender window tab manager', async () => {
  const firstShell = new MockWebContents()
  const secondShell = new MockWebContents()
  await firstShell.loadURL('app://shell/index.html')
  await secondShell.loadURL('app://shell/index.html')
  const firstManager = { id: 'first-manager' }
  const secondManager = { id: 'second-manager' }
  registerShellWebContents(firstShell, new AppWindow({
    id: 'window-1',
    browserWindow: new MockBrowserWindow() as never,
    tabManager: firstManager as never,
  }))
  registerShellWebContents(secondShell, new AppWindow({
    id: 'window-2',
    browserWindow: new MockBrowserWindow() as never,
    tabManager: secondManager as never,
  }))

  const hosts: unknown[] = []
  const syncService = {
    syncCodeforces: async () => ({ platform: 'codeforces', fetched: 0, inserted: 0 }),
    syncVjudge: async (host: unknown) => {
      hosts.push(host)
      return { platform: 'vjudge', fetched: 0, inserted: 0 }
    },
    syncCurrentPage: async (host: unknown) => {
      hosts.push(host)
      return { platform: 'current', fetched: 0, inserted: 0 }
    },
  } as unknown as SyncService
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const originalHandle = ipcMain.handle
  ipcMain.handle = (channel, handler) => {
    handlers.set(channel, handler as (...args: unknown[]) => unknown)
    originalHandle(channel, handler)
  }
  registerSubmissionsIpc({ getSyncService: () => syncService })
  ipcMain.handle = originalHandle

  const firstEvent = { sender: firstShell, senderFrame: firstShell.mainFrame }
  const secondEvent = { sender: secondShell, senderFrame: secondShell.mainFrame }
  await handlers.get('submissions:syncCurrentPage')!(firstEvent)
  await handlers.get('submissions:syncVjudge')!(secondEvent)

  assert.deepStrictEqual(hosts, [firstManager, secondManager])
})
