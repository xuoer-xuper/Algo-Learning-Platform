import { useCallback, useEffect, useState } from 'react'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WindowControls } from './components/WindowControls'
import { TabStrip } from './components/TabStrip'
import { BrowserToolbar } from './components/BrowserToolbar'
import { OmniboxSuggestionsPanel } from './components/Omnibox'
import { ShellRouter } from './components/ShellRouter'
import { useOmnibox } from './components/useOmnibox'
import {
  closeBrowserTab,
  dismissUnresponsiveBrowserTab,
  openInternalBrowserTab,
  reloadBrowserTab,
  type TabStripTabInfo,
} from './components/tabApi'
import { NoticeBar } from './components/ui'
import { FindInPageBar } from './components/FindInPageBar'
import { useBrowserNavigation } from './hooks/useBrowserNavigation'
import {
  setDownloadNoticeVisible,
  showBrowserShellContextMenu,
  subscribeDownloadResult,
} from './hooks/browserShellApi'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState<TabStripTabInfo | null>(null)
  const [downloadResult, setDownloadResult] = useState<ManagedDownloadResult | null>(null)
  const {
    url,
    syncMsg,
    setSidebarWidth,
    applyUrlState,
    navigateFromInput,
    navigateTo,
    goHome,
    goBack,
    goForward,
    reload,
    syncCurrentPage,
    showTransientMessage,
  } = useBrowserNavigation()
  const { inputRef: omniboxInputRef, controller: omnibox } = useOmnibox({
    activeUrl: url,
    onNavigate: navigateFromInput,
  })

  const handleActiveTabChange = useCallback((tab: TabStripTabInfo | null) => {
    setActiveTab(tab)
  }, [])

  const handleReloadActiveTab = useCallback(() => {
    if (activeTab) reloadBrowserTab(activeTab.id)
  }, [activeTab])

  const handleCloseActiveTab = useCallback(() => {
    if (activeTab) closeBrowserTab(activeTab.id)
  }, [activeTab])

  const handleWaitForActiveTab = useCallback(() => {
    if (activeTab) dismissUnresponsiveBrowserTab(activeTab.id)
  }, [activeTab])

  const openInternal = useCallback((page: InternalPage) => {
    void openInternalBrowserTab(page)
  }, [])

  useEffect(() => subscribeDownloadResult((result) => {
    setDownloadResult(result)
    setDownloadNoticeVisible(true)
  }), [])

  useEffect(() => () => setDownloadNoticeVisible(false), [])

  const dismissDownloadNotice = useCallback(() => {
    setDownloadResult(null)
    setDownloadNoticeVisible(false)
  }, [])

  const showUnresponsiveNotice = Boolean(
    activeTab?.isUnresponsive
    && !activeTab.isUnresponsiveNoticeDismissed
    && !activeTab.isCrashed,
  )

  return (
    <ErrorBoundary>
      <div
        className="app-layout"
        onContextMenu={(event) => {
          const target = event.target instanceof Element ? event.target : null
          if (!target || target.closest('[data-tab-id]')) return
          event.preventDefault()
          const kind: ShellContextMenuKind = target.closest('.url-input')
            ? 'omnibox'
            : target.closest('input:not([disabled]), textarea:not([disabled]), [contenteditable="true"]')
              ? 'editor'
              : 'page'
          showBrowserShellContextMenu(kind)
        }}
      >
      <div className="titlebar-layer">
        <TabStrip
          onTabUrlChange={applyUrlState}
          onActiveTabChange={handleActiveTabChange}
          onNotice={showTransientMessage}
        />
        <WindowControls />
      </div>
      <BrowserToolbar
        omnibox={omnibox}
        omniboxInputRef={omniboxInputRef}
        syncMsg={syncMsg}
        onHome={goHome}
        onBack={goBack}
        onForward={goForward}
        onReload={reload}
        onSyncPage={syncCurrentPage}
      />
      {showUnresponsiveNotice && (
        <NoticeBar
          tone="warning"
          title="页面没有响应"
          actions={[
            { label: '重新加载', onClick: handleReloadActiveTab },
            { label: '关闭标签', onClick: handleCloseActiveTab, variant: 'ghost' },
          ]}
          dismissLabel="继续等待"
          onDismiss={handleWaitForActiveTab}
        >
          你可以继续等待，或重新加载这个标签。
        </NoticeBar>
      )}
      {downloadResult && (
        <NoticeBar
          tone={downloadResult.state === 'completed' ? 'success' : downloadResult.state === 'cancelled' ? 'info' : 'danger'}
          title={downloadResult.state === 'completed' ? '下载完成' : downloadResult.state === 'cancelled' ? '下载已取消' : '下载失败'}
          dismissLabel="关闭下载通知"
          onDismiss={dismissDownloadNotice}
        >
          {downloadResult.errorCode === 'path-setup-failed'
            ? `无法在受控下载目录中保存 ${downloadResult.fileName}`
            : downloadResult.errorCode === 'intercept-failed'
              ? `无法安全处理 ${downloadResult.fileName}`
              : downloadResult.fileName}
        </NoticeBar>
      )}
      <FindInPageBar
        activeTabId={omnibox.open || activeTab?.kind !== 'web' ? null : activeTab.id}
      />
      {omnibox.open ? (
        <OmniboxSuggestionsPanel controller={omnibox} />
      ) : (
        <div className="content-area">
          <ProblemSidebar
            onNavigate={navigateTo}
            onShowDetail={(problemId) => openInternal({ type: 'problem-detail', problemId })}
            onShowNotes={(problemId) => openInternal({ type: 'notes', problemId })}
            onWidthChange={setSidebarWidth}
          />
          <main className="main-content">
            <ShellRouter
              activeTab={activeTab}
              onNavigate={navigateTo}
              onCloseActiveTab={handleCloseActiveTab}
              onReloadActiveTab={handleReloadActiveTab}
            />
          </main>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}

export default App
