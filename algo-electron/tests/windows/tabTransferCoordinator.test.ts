import { beforeEach, describe, expect, it } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'
import { AppWindow } from '../../electron/windows/AppWindow.ts'
import { TabTransferCoordinator } from '../../electron/windows/TabTransferCoordinator.ts'

function createAppWindow(id: string, bounds?: { x: number; y: number; width: number; height: number }): AppWindow {
  const browserWindow = new MockBrowserWindow(bounds)
  return new AppWindow({
    id,
    browserWindow: browserWindow as never,
    tabManager: new TabManager(browserWindow as never, { windowId: id }),
  })
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve = (_value: T): void => {}
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('TabTransferCoordinator', () => {
  beforeEach(() => resetElectronMock())

  it('keeps an in-strip drag in the source window as a reorder', async () => {
    const source = createAppWindow('source')
    const first = source.tabManager.openInternalTab({ type: 'home' })
    const second = source.tabManager.openInternalTab({ type: 'settings' })
    let createCount = 0
    const coordinator = new TabTransferCoordinator({
      createWindow: async () => { createCount += 1; return null },
      getWindows: () => [source],
      getMostRecentWindow: () => source,
    })

    await expect(coordinator.finishDrag(source, second, 0, 100, 10)).resolves.toBe(true)

    expect(source.tabManager.getTabList().map((tab) => tab.id)).toEqual([second, first])
    expect(createCount).toBe(0)
  })

  it('moves a tab into another shell when dropped over its tab strip', async () => {
    const source = createAppWindow('source', { x: 0, y: 0, width: 1200, height: 800 })
    const target = createAppWindow('target', { x: 1300, y: 0, width: 1200, height: 800 })
    source.tabManager.openInternalTab({ type: 'home' })
    const movedId = source.tabManager.openInternalTab({ type: 'settings' })
    const targetHomeId = target.tabManager.openInternalTab({ type: 'home' })
    const coordinator = new TabTransferCoordinator({
      createWindow: async () => null,
      getWindows: () => [source, target],
      getMostRecentWindow: () => target,
    })

    await expect(coordinator.finishDrag(source, movedId, 0, 1400, 20)).resolves.toBe(true)

    expect(source.tabManager.getTabList().some((tab) => tab.id === movedId)).toBe(false)
    expect(target.tabManager.getTabList().map((tab) => tab.id)).toEqual([targetHomeId, movedId])
    expect(target.tabManager.getActiveTabId()).toBe(movedId)
  })

  it('creates an empty full shell and closes the source after moving its final tab', async () => {
    const source = createAppWindow('source')
    const target = createAppWindow('target')
    const movedId = source.tabManager.openInternalTab({ type: 'settings' })
    const coordinator = new TabTransferCoordinator({
      createWindow: async () => target,
      getWindows: () => [source, target],
    })

    await expect(coordinator.moveToNewWindow(source, movedId)).resolves.toBe(true)

    expect(source.browserWindow.isDestroyed()).toBe(true)
    expect(target.tabManager.getTabList().map((tab) => tab.id)).toEqual([movedId])
    expect(target.tabManager.getActiveTabId()).toBe(movedId)
  })

  it('rolls the source back and closes a newly-created target when adoption fails', async () => {
    const source = createAppWindow('source')
    const target = createAppWindow('target')
    source.tabManager.openInternalTab({ type: 'settings' }, { id: 'shared-id' })
    target.tabManager.openInternalTab({ type: 'home' }, { id: 'shared-id' })
    const diagnostics: string[] = []
    const coordinator = new TabTransferCoordinator({
      createWindow: async () => target,
      getWindows: () => [source, target],
      onDiagnostic: (event) => { diagnostics.push(event) },
    })

    await expect(coordinator.moveToNewWindow(source, 'shared-id')).resolves.toBe(false)

    expect(source.tabManager.getActiveTabId()).toBe('shared-id')
    expect(target.browserWindow.isDestroyed()).toBe(true)
    expect(diagnostics).toContain('browser.tab-transfer-adopt-failed')
  })

  it('rejects a concurrent transfer attempt for the same stable tab id', async () => {
    const source = createAppWindow('source')
    const target = createAppWindow('target')
    const movedId = source.tabManager.openInternalTab({ type: 'settings' })
    const targetCreation = deferred<AppWindow | null>()
    const coordinator = new TabTransferCoordinator({
      createWindow: () => targetCreation.promise,
      getWindows: () => [source, target],
    })

    const first = coordinator.moveToNewWindow(source, movedId)
    await Promise.resolve()
    await expect(coordinator.moveToNewWindow(source, movedId)).resolves.toBe(false)
    targetCreation.resolve(target)
    await expect(first).resolves.toBe(true)
  })
})
