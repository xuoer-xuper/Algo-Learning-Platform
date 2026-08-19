import { useEffect, useRef, useState } from 'react'
import {
  closeBrowserTab,
  createBrowserTab,
  finishBrowserTabDrag,
  getBrowserTabList,
  moveBrowserTabToNewWindow,
  subscribeTabListChanged,
  switchBrowserTab,
  type TabStripTabInfo,
} from './tabApi'
import { showBrowserTabContextMenu } from '../hooks/browserShellApi'
import { Icon, type IconName } from './ui'
import './TabStrip.css'

interface TabStripProps {
  onTabUrlChange?: (url: string) => void
  onActiveTabChange?: (tab: TabStripTabInfo | null) => void
}

interface PointerDragState {
  tabId: string
  pointerId: number
  startX: number
  startY: number
  deltaX: number
  deltaY: number
  sourceIndex: number
  targetIndex: number
  dragging: boolean
}

interface DropMarker {
  tabId: string
  edge: 'before' | 'after'
}

const POINTER_DRAG_THRESHOLD = 5
const POINTER_EDGE_SCROLL_ZONE = 36
const POINTER_EDGE_SCROLL_STEP = 14
const TAB_CLOSE_ANIMATION_MS = 140

function getInternalIcon(page: InternalPage): IconName {
  switch (page.type) {
    case 'home': return 'home'
    case 'settings': return 'settings'
    case 'dashboard': return 'chart'
    case 'scripts':
    case 'script-install': return 'code'
    case 'coach-metrics': return 'bot'
    case 'problem-detail': return 'external'
    case 'notes': return 'note'
    case 'credentials': return 'log-in'
  }
}

function TabIcon({ tab }: { tab: TabStripTabInfo }) {
  const [faviconFailed, setFaviconFailed] = useState(false)

  useEffect(() => {
    setFaviconFailed(false)
  }, [tab.favicon])

  if (tab.isLoading) {
    return <span className="tab-item-spinner" aria-label="正在加载" />
  }
  if (tab.isCrashed) {
    return <Icon className="tab-item-icon" name="refresh" size={14} />
  }
  if (tab.kind === 'web' && tab.favicon && !faviconFailed) {
    return (
      <img
        key={tab.favicon}
        className="tab-item-favicon"
        src={tab.favicon}
        alt=""
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setFaviconFailed(true)}
      />
    )
  }
  return (
    <Icon
      className="tab-item-icon"
      name={tab.kind === 'internal' ? getInternalIcon(tab.page) : 'globe'}
      size={14}
    />
  )
}

function getDropMarker(tabs: TabStripTabInfo[], drag: PointerDragState | null): DropMarker | null {
  if (!drag?.dragging || drag.sourceIndex === drag.targetIndex) return null
  const remainingTabs = tabs.filter((tab) => tab.id !== drag.tabId)
  if (remainingTabs.length === 0) return null
  if (drag.targetIndex >= remainingTabs.length) {
    return { tabId: remainingTabs[remainingTabs.length - 1].id, edge: 'after' }
  }
  return { tabId: remainingTabs[drag.targetIndex].id, edge: 'before' }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function TabStrip({ onTabUrlChange, onActiveTabChange }: TabStripProps) {
  const [tabs, setTabs] = useState<TabStripTabInfo[]>([])
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(() => new Set())
  const [dragState, setDragState] = useState<PointerDragState | null>(null)
  const tabsContainerRef = useRef<HTMLDivElement | null>(null)
  const prevActiveIdRef = useRef<string | null>(null)
  const dragStateRef = useRef<PointerDragState | null>(null)
  const dragAutoScrollFrameRef = useRef<number | null>(null)
  const dragPointerXRef = useRef<number | null>(null)
  const suppressClickTabIdRef = useRef<string | null>(null)
  const closeTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    let disposed = false
    let listRevision = 0
    const closeTimers = closeTimersRef.current

    const applyTabs = (newTabs: TabStripTabInfo[]) => {
      if (disposed) return

      const survivingIds = new Set(newTabs.map((tab) => tab.id))
      for (const [tabId, timer] of closeTimers) {
        if (survivingIds.has(tabId)) continue
        clearTimeout(timer)
        closeTimers.delete(tabId)
      }
      setClosingTabIds((current) => new Set([...current].filter((tabId) => survivingIds.has(tabId))))
      setTabs(newTabs)

      const active = newTabs.find((tab) => tab.isActive)
      onActiveTabChange?.(active ?? null)
      if (active && active.id !== prevActiveIdRef.current) {
        prevActiveIdRef.current = active.id
        onTabUrlChange?.(active.url)
      }
    }

    const unsub = subscribeTabListChanged((newTabs) => {
      listRevision += 1
      applyTabs(newTabs)
    })

    const requestRevision = listRevision
    void getBrowserTabList().then(
      (initialTabs) => {
        if (listRevision !== requestRevision) return
        applyTabs(initialTabs)
      },
      () => undefined,
    )

    return () => {
      disposed = true
      unsub()
      for (const timer of closeTimers.values()) clearTimeout(timer)
      closeTimers.clear()
      if (dragAutoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current)
        dragAutoScrollFrameRef.current = null
      }
    }
  }, [onActiveTabChange, onTabUrlChange])

  const activeTabId = tabs.find((tab) => tab.isActive)?.id ?? null
  useEffect(() => {
    if (!activeTabId) return
    const activeElement = tabsContainerRef.current?.querySelector<HTMLElement>(
      `[data-tab-id="${activeTabId}"]`,
    )
    activeElement?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  const requestClose = (tabId: string) => {
    if (closeTimersRef.current.has(tabId)) return
    setClosingTabIds((current) => new Set(current).add(tabId))
    const delay = prefersReducedMotion() ? 0 : TAB_CLOSE_ANIMATION_MS
    const timer = setTimeout(() => {
      closeTimersRef.current.delete(tabId)
      closeBrowserTab(tabId)
    }, delay)
    closeTimersRef.current.set(tabId, timer)
  }

  const handleSwitch = (tabId: string) => {
    if (suppressClickTabIdRef.current === tabId) {
      suppressClickTabIdRef.current = null
      return
    }
    switchBrowserTab(tabId)
  }

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      switchBrowserTab(tabId)
      return
    }

    const currentIndex = tabs.findIndex((tab) => tab.id === tabId)
    if (currentIndex < 0) return

    let targetIndex: number | null = null
    if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + tabs.length) % tabs.length
    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % tabs.length
    if (event.key === 'Home') targetIndex = 0
    if (event.key === 'End') targetIndex = tabs.length - 1
    if (targetIndex === null || targetIndex === currentIndex) return

    event.preventDefault()
    const targetTab = tabs[targetIndex]
    const targetElement = Array.from(
      tabsContainerRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [],
    ).find((element) => element.dataset.tabId === targetTab.id)
    targetElement?.querySelector<HTMLButtonElement>('.tab-item-main')?.focus()
    switchBrowserTab(targetTab.id)
  }

  const handleAuxClick = (event: React.MouseEvent, tabId: string) => {
    if (event.button !== 1) return
    event.preventDefault()
    requestClose(tabId)
  }

  const findTargetIndex = (tabId: string, clientX: number): number => {
    const candidates = Array.from(
      tabsContainerRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [],
    ).filter((element) => element.dataset.tabId !== tabId)
    for (let index = 0; index < candidates.length; index += 1) {
      const rect = candidates[index].getBoundingClientRect()
      if (clientX < rect.left + rect.width / 2) return index
    }
    return candidates.length
  }

  const stopDragAutoScroll = () => {
    if (dragAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAutoScrollFrameRef.current)
      dragAutoScrollFrameRef.current = null
    }
    dragPointerXRef.current = null
  }

  const runDragAutoScroll = () => {
    dragAutoScrollFrameRef.current = null
    const current = dragStateRef.current
    const container = tabsContainerRef.current
    const clientX = dragPointerXRef.current
    if (!current?.dragging || !container || clientX === null) return
    if (container.scrollWidth <= container.clientWidth) return

    const rect = container.getBoundingClientRect()
    let delta = 0
    if (clientX < rect.left + POINTER_EDGE_SCROLL_ZONE) delta = -POINTER_EDGE_SCROLL_STEP
    else if (clientX > rect.right - POINTER_EDGE_SCROLL_ZONE) delta = POINTER_EDGE_SCROLL_STEP
    if (delta === 0) return

    const previousScrollLeft = container.scrollLeft
    container.scrollLeft += delta
    if (container.scrollLeft === previousScrollLeft) return

    const next = {
      ...current,
      targetIndex: findTargetIndex(current.tabId, clientX),
    }
    dragStateRef.current = next
    setDragState(next)
    dragAutoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll)
  }

  const updateDragAutoScroll = (clientX: number) => {
    dragPointerXRef.current = clientX
    if (dragAutoScrollFrameRef.current === null) {
      dragAutoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll)
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, tabId: string) => {
    if (event.button !== 0 || event.isPrimary === false) return
    const sourceIndex = tabs.findIndex((tab) => tab.id === tabId)
    if (sourceIndex < 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragStateRef.current = {
      tabId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      sourceIndex,
      targetIndex: sourceIndex,
      dragging: false,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragStateRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const deltaX = event.clientX - current.startX
    const deltaY = event.clientY - current.startY
    if (!current.dragging && Math.hypot(deltaX, deltaY) < POINTER_DRAG_THRESHOLD) return

    const next = {
      ...current,
      deltaX,
      deltaY,
      targetIndex: findTargetIndex(current.tabId, event.clientX),
      dragging: true,
    }
    dragStateRef.current = next
    setDragState(next)
    updateDragAutoScroll(event.clientX)
    event.preventDefault()
  }

  const finishPointerDrag = (event: React.PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const current = dragStateRef.current
    if (!current || current.pointerId !== event.pointerId) return
    stopDragAutoScroll()
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (commit && current.dragging) {
      event.preventDefault()
      suppressClickTabIdRef.current = current.tabId
      void finishBrowserTabDrag(
        current.tabId,
        current.targetIndex,
        event.screenX,
        event.screenY,
      ).catch(() => false)
    }
    dragStateRef.current = null
    setDragState(null)
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) return
    event.preventDefault()
    event.currentTarget.scrollLeft += delta
  }

  const dropMarker = getDropMarker(tabs, dragState)

  return (
    <div className="tab-strip">
      <div
        ref={tabsContainerRef}
        className="tab-strip-tabs"
        role="tablist"
        aria-label="标签页"
        onWheel={handleWheel}
      >
        {tabs.map((tab) => {
          const title = tab.title || '首页'
          const isDragging = dragState?.dragging && dragState.tabId === tab.id
          const markerEdge = dropMarker?.tabId === tab.id ? dropMarker.edge : null
          return (
            <div
              key={tab.id}
              className={[
                'tab-item',
                tab.isActive ? 'tab-item-active' : '',
                closingTabIds.has(tab.id) ? 'tab-item-closing' : '',
                isDragging ? 'tab-item-dragging' : '',
              ].filter(Boolean).join(' ')}
              data-tab-id={tab.id}
              style={isDragging ? { transform: `translateX(${dragState.deltaX}px)` } : undefined}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                showBrowserTabContextMenu(tab.id)
              }}
            >
              {markerEdge && <span className={`tab-drop-indicator tab-drop-indicator-${markerEdge}`} />}
              <button
                type="button"
                className="tab-item-main"
                role="tab"
                aria-selected={tab.isActive}
                aria-label={title}
                tabIndex={tab.isActive ? 0 : -1}
                draggable={false}
                onClick={() => handleSwitch(tab.id)}
                onAuxClick={(event) => handleAuxClick(event, tab.id)}
                onDoubleClick={() => { void moveBrowserTabToNewWindow(tab.id).catch(() => false) }}
                onPointerDown={(event) => handlePointerDown(event, tab.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={(event) => finishPointerDrag(event, true)}
                onPointerCancel={(event) => finishPointerDrag(event, false)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                title={title}
              >
                <TabIcon tab={tab} />
                <span className="tab-item-title">{title}</span>
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="tab-item-close"
                  onClick={(event) => {
                    event.stopPropagation()
                    requestClose(tab.id)
                  }}
                  title="关闭标签"
                  aria-label={`关闭 ${title}`}
                >
                  <Icon name="close" size={11} strokeWidth={2} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="tab-strip-new"
        onClick={() => { void createBrowserTab() }}
        title="新建标签"
        aria-label="新建标签"
      >
        <Icon name="plus" size={15} />
      </button>
      <div className="tab-strip-drag-region" aria-hidden="true" />
    </div>
  )
}
