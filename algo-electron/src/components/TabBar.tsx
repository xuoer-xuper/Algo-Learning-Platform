import { useEffect, useRef, useState } from 'react'
import './TabBar.css'

interface TabInfo {
  id: string
  url: string
  title: string
  isActive: boolean
}

interface TabBarProps {
  onTabUrlChange?: (url: string) => void
}

export function TabBar({ onTabUrlChange }: TabBarProps) {
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const prevActiveIdRef = useRef<string | null>(null)

  useEffect(() => {
    const unsub = window.electronAPI.onTabListChanged((newTabs: TabInfo[]) => {
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
    window.electronAPI.switchTab(tabId)
  }

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    window.electronAPI.closeTab(tabId)
  }

  const handleDetach = (tabId: string) => {
    if (tabs.length > 1) {
      const tab = tabs.find(t => t.id === tabId)
      if (tab && tab.url && tab.url !== 'about:blank') {
        window.electronAPI.detachTab(tabId)
      }
    }
  }

  const handleNewTab = () => {
    window.electronAPI.createTab()
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
            onDoubleClick={() => handleDetach(tab.id)}
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
                &#10005;
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
        +
      </button>
    </div>
  )
}
