import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useIpcSubscription } from './hooks/useIpcSubscription'
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
  getCredentialAutofillPrompt,
  getCredentialCapturePrompt,
  respondCredentialAutofill,
  respondCredentialCapture,
  setDownloadNoticeVisible,
  setErrorNoticeVisible,
  getUserScriptHostPermissionPrompt,
  respondUserScriptHostPermission,
  showBrowserShellContextMenu,
  subscribeCredentialAutofillPrompt,
  subscribeCredentialCapturePrompt,
  subscribeCredentialCaptureResult,
  subscribeDownloadResult,
  subscribeUserScriptHostPermissionPrompt,
} from './hooks/browserShellApi'
import { loadCoachState, subscribeCoachContestMode } from './features/coach/coachDataApi'
import {
  dismissRendererError,
  subscribeRendererErrors,
  type RendererErrorReport,
} from './rendererErrors'
import './App.css'
import type { InternalPage, ManagedDownloadResult } from '@shared/types/browser'
import type { CoachContestModePayload } from '@shared/types/coach'
import type { CredentialCaptureAction, CredentialCapturePrompt } from '@shared/types/credentials'
import type { ShellContextMenuKind } from '@shared/types/window'

async function loadContestMode(): Promise<CoachContestModePayload | null> {
  const state = await loadCoachState()
  return { isContestMode: state?.is_contest_mode === true, contest: state?.contest ?? null }
}

function App() {
  const [activeTab, setActiveTab] = useState<TabStripTabInfo | null>(null)
  const [downloadResult, setDownloadResult] = useState<ManagedDownloadResult | null>(null)
  const [contestMode] = useIpcSubscription(loadContestMode, subscribeCoachContestMode, null)
  const [userScriptPermission, setUserScriptPermission] = useIpcSubscription(
    getUserScriptHostPermissionPrompt,
    subscribeUserScriptHostPermissionPrompt,
    null,
  )
  const [credentialAutofillPrompt, setCredentialAutofillPrompt] = useIpcSubscription(
    getCredentialAutofillPrompt,
    subscribeCredentialAutofillPrompt,
    null,
  )
  const [credentialCaptureError, setCredentialCaptureError] = useState(false)
  const capturePromptRef = useRef<CredentialCapturePrompt | null>(null)
  const subscribeCapture = useCallback(
    (listener: (prompt: CredentialCapturePrompt | null) => void) => {
      let disposed = false
      const unsubscribe = subscribeCredentialCapturePrompt((prompt) => {
        if (disposed) return
        capturePromptRef.current = prompt
        setCredentialCaptureError(false)
        listener(prompt)
      })
      return () => {
        disposed = true
        unsubscribe()
      }
    },
    [],
  )
  const [credentialCapturePrompt, setCredentialCapturePrompt] = useIpcSubscription(
    getCredentialCapturePrompt,
    subscribeCapture,
    null,
  )
  useLayoutEffect(() => {
    capturePromptRef.current = credentialCapturePrompt
  }, [credentialCapturePrompt])
  const [rendererError, setRendererError] = useState<RendererErrorReport | null>(null)
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

  useEffect(
    () =>
      subscribeDownloadResult((result) => {
        setDownloadResult(result)
        setDownloadNoticeVisible(true)
      }),
    [],
  )

  useEffect(() => () => setDownloadNoticeVisible(false), [])

  // 订阅时会补发挂载前积压的错误，因此首屏读取失败也能显示。
  useEffect(
    () =>
      subscribeRendererErrors((report) => {
        setRendererError(report)
        setErrorNoticeVisible(report !== null)
      }),
    [],
  )

  useEffect(() => () => setErrorNoticeVisible(false), [])

  useEffect(() => {
    let disposed = false
    const unsubscribe = subscribeCredentialCaptureResult((result) => {
      if (disposed) return
      if (capturePromptRef.current?.captureId === result.captureId) {
        capturePromptRef.current = null
        setCredentialCapturePrompt(null)
      }
      setCredentialCaptureError(!result.success)
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [setCredentialCapturePrompt])

  const dismissDownloadNotice = useCallback(() => {
    setDownloadResult(null)
    setDownloadNoticeVisible(false)
  }, [])

  const answerUserScriptPermission = useCallback(
    (allow: boolean) => {
      const promptId = userScriptPermission?.promptId
      if (!promptId) return
      setUserScriptPermission(null)
      void respondUserScriptHostPermission(promptId, allow)
        .then(() => getUserScriptHostPermissionPrompt())
        .then((prompt) => setUserScriptPermission(prompt))
        .catch(() => setUserScriptPermission(null))
    },
    [userScriptPermission, setUserScriptPermission],
  )

  const answerCredentialAutofill = useCallback(
    (credentialId: string | null) => {
      const prompt = credentialAutofillPrompt
      if (!prompt) return
      setCredentialAutofillPrompt(null)
      void respondCredentialAutofill(prompt.requestId, credentialId).catch(() => undefined)
    },
    [credentialAutofillPrompt, setCredentialAutofillPrompt],
  )

  const answerCredentialCapture = useCallback(
    (action: CredentialCaptureAction) => {
      const prompt = credentialCapturePrompt
      if (!prompt) return
      setCredentialCapturePrompt(null)
      setCredentialCaptureError(false)
      void respondCredentialCapture(prompt.captureId, action).catch(() =>
        setCredentialCaptureError(true),
      )
    },
    [credentialCapturePrompt, setCredentialCapturePrompt],
  )

  const showUnresponsiveNotice = Boolean(
    activeTab?.isUnresponsive && !activeTab.isUnresponsiveNoticeDismissed && !activeTab.isCrashed,
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
            : target.closest(
                  'input:not([disabled]), textarea:not([disabled]), [contenteditable="true"]',
                )
              ? 'editor'
              : 'page'
          showBrowserShellContextMenu(kind)
        }}
      >
        <div className="titlebar-layer">
          <TabStrip onTabUrlChange={applyUrlState} onActiveTabChange={handleActiveTabChange} />
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
        {userScriptPermission && (
          <NoticeBar
            tone="warning"
            title="用户脚本网络权限"
            actions={[
              { label: '允许', onClick: () => answerUserScriptPermission(true) },
              { label: '拒绝', onClick: () => answerUserScriptPermission(false), variant: 'ghost' },
            ]}
          >
            {`脚本“${userScriptPermission.scriptName}”请求从 ${userScriptPermission.sourceHost} 访问 ${userScriptPermission.targetHost}`}
          </NoticeBar>
        )}
        {credentialAutofillPrompt && (
          <NoticeBar
            tone="info"
            title="选择登录账户"
            actions={credentialAutofillPrompt.credentials.map((credential) => ({
              label: credential.displayName || credential.username,
              onClick: () => answerCredentialAutofill(credential.credentialId),
            }))}
            dismissLabel="取消自动填充"
            onDismiss={() => answerCredentialAutofill(null)}
          >
            {`检测到 ${credentialAutofillPrompt.credentials.length} 个 ${credentialAutofillPrompt.siteId} 账户`}
          </NoticeBar>
        )}
        {credentialCapturePrompt && (
          <NoticeBar
            tone="info"
            title={credentialCapturePrompt.isUpdate ? '更新密码' : '保存账户'}
            actions={[
              {
                label: credentialCapturePrompt.isUpdate ? '更新密码' : '保存账户',
                onClick: () =>
                  answerCredentialCapture(credentialCapturePrompt.isUpdate ? 'update' : 'save'),
              },
            ]}
            dismissLabel="暂不保存"
            onDismiss={() => answerCredentialCapture('cancel')}
          >
            {credentialCapturePrompt.isUpdate
              ? `${credentialCapturePrompt.siteName} 账户 ${credentialCapturePrompt.username} 的密码已变化（${credentialCapturePrompt.masked}）`
              : `保存 ${credentialCapturePrompt.siteName} 账户 ${credentialCapturePrompt.username}（${credentialCapturePrompt.masked}）`}
          </NoticeBar>
        )}
        {credentialCaptureError && !credentialCapturePrompt && (
          <NoticeBar
            tone="danger"
            title="凭据保存失败"
            dismissLabel="关闭"
            onDismiss={() => setCredentialCaptureError(false)}
          >
            未能保存登录账户，请稍后重试。
          </NoticeBar>
        )}
        {rendererError && (
          <NoticeBar
            tone="danger"
            title={`${rendererError.scope}失败`}
            dismissLabel="关闭错误通知"
            onDismiss={dismissRendererError}
          >
            {rendererError.count > 1
              ? `${rendererError.message}（${rendererError.count} 次）`
              : rendererError.message}
          </NoticeBar>
        )}
        {contestMode?.isContestMode && (
          <NoticeBar tone="warning" title="比赛模式">
            Coach 已静默，比赛期间不会显示提示。
          </NoticeBar>
        )}
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
            tone={
              downloadResult.state === 'completed'
                ? 'success'
                : downloadResult.state === 'cancelled'
                  ? 'info'
                  : 'danger'
            }
            title={
              downloadResult.state === 'completed'
                ? '下载完成'
                : downloadResult.state === 'cancelled'
                  ? '下载已取消'
                  : '下载失败'
            }
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
