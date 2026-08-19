import type { WebContents, WebContentsView } from 'electron'

export type ViewRegistryEntry = ShellViewRegistryEntry | TabViewRegistryEntry

export interface ShellViewRegistryEntry {
  kind: 'shell'
  webContentsId: number
  windowId: string
  tabId: null
  view: null
}

export interface TabViewRegistryEntry {
  kind: 'tab'
  webContentsId: number
  windowId: string
  tabId: string
  view: WebContentsView
}

type WebContentsIdentity = Pick<WebContents, 'id'> | number | null | undefined

function getWebContentsId(identity: WebContentsIdentity): number | null {
  try {
    const id = typeof identity === 'number' ? identity : identity?.id
    return Number.isInteger(id) && Number(id) > 0 ? Number(id) : null
  } catch {
    return null
  }
}

export class ViewRegistry {
  private readonly entries = new Map<number, ViewRegistryEntry>()

  registerShell(windowId: string, webContents: Pick<WebContents, 'id'>): ShellViewRegistryEntry {
    const webContentsId = getWebContentsId(webContents)
    if (webContentsId === null) throw new Error('Shell webContents id is invalid')
    const entry: ShellViewRegistryEntry = {
      kind: 'shell',
      webContentsId,
      windowId,
      tabId: null,
      view: null,
    }
    this.setEntry(entry)
    return entry
  }

  registerTab(windowId: string, tabId: string, view: WebContentsView): TabViewRegistryEntry {
    const webContentsId = getWebContentsId(view.webContents)
    if (webContentsId === null) throw new Error('Tab webContents id is invalid')
    const entry: TabViewRegistryEntry = {
      kind: 'tab',
      webContentsId,
      windowId,
      tabId,
      view,
    }
    this.setEntry(entry)
    return entry
  }

  get(identity: WebContentsIdentity): ViewRegistryEntry | null {
    const id = getWebContentsId(identity)
    return id === null ? null : this.entries.get(id) ?? null
  }

  getByWindow(windowId: string): ViewRegistryEntry[] {
    return [...this.entries.values()].filter((entry) => entry.windowId === windowId)
  }

  transferTab(webContentsId: number, windowId: string, tabId: string): boolean {
    const entry = this.entries.get(webContentsId)
    if (!entry || entry.kind !== 'tab') return false
    this.entries.set(webContentsId, { ...entry, windowId, tabId })
    return true
  }

  unregister(identity: WebContentsIdentity, expectedWindowId?: string): boolean {
    const id = getWebContentsId(identity)
    if (id === null) return false
    const entry = this.entries.get(id)
    if (!entry || (expectedWindowId && entry.windowId !== expectedWindowId)) return false
    return this.entries.delete(id)
  }

  unregisterWindow(windowId: string): number {
    let removed = 0
    for (const [webContentsId, entry] of this.entries) {
      if (entry.windowId !== windowId) continue
      this.entries.delete(webContentsId)
      removed += 1
    }
    return removed
  }

  clear(): void {
    this.entries.clear()
  }

  private setEntry(entry: ViewRegistryEntry): void {
    const existing = this.entries.get(entry.webContentsId)
    if (existing && (
      existing.windowId !== entry.windowId
      || existing.tabId !== entry.tabId
      || existing.kind !== entry.kind
    )) {
      throw new Error(`webContents ${entry.webContentsId} already has an owner`)
    }
    this.entries.set(entry.webContentsId, entry)
  }
}
