import { useEffect, useRef, useState } from 'react'
import {
  closeBrowserTab,
  createBrowserTab,
  subscribeTabListChanged,
  switchBrowserTab,
  type TabBarTabInfo,
} from './tabApi'
import { Icon } from './ui'
import './TabBar.css'

interface TabBarProps {
  onTabUrlChange?: (url: string) => void
  onNotice?: (message: string) => void
}

const DETACH_UNAVAILABLE_NOTICE = '拆分窗口将在多窗口版本以更完整形态回归'

export function TabBar({ onTabUrlChange, onNotice }: TabBarProps) {
  const [tabs, setTabs] = useState<TabBarTabInfo[]>([])
  const prevActiveIdRef = useRef<string | null>(null)

  useEffect(() => {
    const unsub = subscribeTabListChanged((newTabs) => {
      setTabs(newTabs)

      const active = newTabs.find((t) => t.isActive)
      if (active && active.id !== prevActiveIdRef.current) {
        prevActiveIdRef.current = active.id
        onTabUrlChange?.(active.url)
      }
    })
    return unsub
  }, [onTabUrlChange])

  const handleSwitch = (tabId: string) => {
    switchBrowserTab(tabId)
  }

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    closeBrowserTab(tabId)
  }

  const handleAuxClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button !== 1) return
    e.preventDefault()
    closeBrowserTab(tabId)
  }

  const handleDetachUnavailable = () => {
    onNotice?.(DETACH_UNAVAILABLE_NOTICE)
  }

  const handleNewTab = () => {
    createBrowserTab()
  }

  return (
    <div className="tab-bar">
      <div className="tab-bar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-item${tab.isActive ? ' tab-item-active' : ''}`}
            onClick={() => handleSwitch(tab.id)}
            onAuxClick={(e) => handleAuxClick(e, tab.id)}
            onDoubleClick={handleDetachUnavailable}
            title={tab.title || '首页'}
          >
            <span className="tab-item-title">{tab.title || '首页'}</span>
            {tabs.length > 1 && (
              <span
                role="button"
                className="tab-item-close"
                onClick={(e) => handleClose(e, tab.id)}
                title="关闭标签"
              >
                <Icon name="close" size={11} strokeWidth={2} />
              </span>
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="tab-bar-new"
        onClick={handleNewTab}
        title="新建标签"
        aria-label="新建标签"
      >
        <Icon name="plus" size={15} />
      </button>
    </div>
  )
}
