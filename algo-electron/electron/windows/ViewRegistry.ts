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

export interface ViewRegistryTabTransfer {
  readonly webContentsId: number
  readonly sourceWindowId: string
  readonly tabId: string
}

interface ActiveTabTransfer {
  handle: ViewRegistryTabTransfer
  source: TabViewRegistryEntry
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
  private readonly activeTabTransfers = new Map<number, ActiveTabTransfer>()

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
    if (!entry || entry.kind !== 'tab' || this.activeTabTransfers.has(webContentsId)) return false
    this.entries.set(webContentsId, { ...entry, windowId, tabId })
    return true
  }

  beginTabTransfer(
    webContentsId: number,
    expectedWindowId: string,
    expectedTabId: string,
  ): ViewRegistryTabTransfer | null {
    const entry = this.entries.get(webContentsId)
    if (
      !entry
      || entry.kind !== 'tab'
      || entry.windowId !== expectedWindowId
      || entry.tabId !== expectedTabId
      || this.activeTabTransfers.has(webContentsId)
    ) {
      return null
    }
    const handle: ViewRegistryTabTransfer = Object.freeze({
      webContentsId,
      sourceWindowId: expectedWindowId,
      tabId: expectedTabId,
    })
    this.activeTabTransfers.set(webContentsId, { handle, source: entry })
    return handle
  }

  moveTabTransfer(
    transfer: ViewRegistryTabTransfer,
    windowId: string,
    tabId: string = transfer.tabId,
  ): boolean {
    const active = this.activeTabTransfers.get(transfer.webContentsId)
    const entry = this.entries.get(transfer.webContentsId)
    if (!active || active.handle !== transfer || !entry || entry.kind !== 'tab') return false
    if (entry.view !== active.source.view || entry.tabId !== active.source.tabId) return false
    this.entries.set(transfer.webContentsId, { ...entry, windowId, tabId })
    return true
  }

  completeTabTransfer(transfer: ViewRegistryTabTransfer): boolean {
    const active = this.activeTabTransfers.get(transfer.webContentsId)
    if (!active || active.handle !== transfer) return false
    this.activeTabTransfers.delete(transfer.webContentsId)
    return true
  }

  rollbackTabTransfer(transfer: ViewRegistryTabTransfer): boolean {
    const active = this.activeTabTransfers.get(transfer.webContentsId)
    if (!active || active.handle !== transfer) return false
    const entry = this.entries.get(transfer.webContentsId)
    this.activeTabTransfers.delete(transfer.webContentsId)
    if (!entry || entry.kind !== 'tab' || entry.view !== active.source.view) return false
    this.entries.set(transfer.webContentsId, active.source)
    return true
  }

  discardTabTransfer(transfer: ViewRegistryTabTransfer): boolean {
    const active = this.activeTabTransfers.get(transfer.webContentsId)
    if (!active || active.handle !== transfer) return false
    this.activeTabTransfers.delete(transfer.webContentsId)
    return this.entries.delete(transfer.webContentsId)
  }

  unregister(identity: WebContentsIdentity, expectedWindowId?: string): boolean {
    const id = getWebContentsId(identity)
    if (id === null) return false
    const entry = this.entries.get(id)
    if (!entry || (expectedWindowId && entry.windowId !== expectedWindowId)) return false
    this.activeTabTransfers.delete(id)
    return this.entries.delete(id)
  }

  unregisterWindow(windowId: string): number {
    let removed = 0
    for (const [webContentsId, entry] of this.entries) {
      if (entry.windowId !== windowId) continue
      if (this.activeTabTransfers.has(webContentsId)) continue
      this.entries.delete(webContentsId)
      removed += 1
    }
    return removed
  }

  clear(): void {
    this.entries.clear()
    this.activeTabTransfers.clear()
  }

  private setEntry(entry: ViewRegistryEntry): void {
    const existing = this.entries.get(entry.webContentsId)
    if (this.activeTabTransfers.has(entry.webContentsId)) {
      throw new Error(`webContents ${entry.webContentsId} is being transferred`)
    }
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
