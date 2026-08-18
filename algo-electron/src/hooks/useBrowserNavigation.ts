import { useCallback, useEffect, useRef, useState } from 'react'
import {
  goBrowserBack,
  goBrowserForward,
  goBrowserHome,
  navigateBrowser,
  reloadBrowser,
  setBrowserSidebarWidth,
  subscribeUiCommand,
  subscribeUrlChanged,
  syncBrowserCurrentPage,
} from './browserShellApi'

export function useBrowserNavigation() {
  const [url, setUrl] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(220)
  const syncMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTransientMessage = useCallback((message: string) => {
    setSyncMsg(message)
    if (syncMessageTimer.current) clearTimeout(syncMessageTimer.current)
    syncMessageTimer.current = setTimeout(() => setSyncMsg(''), 4000)
  }, [])

  const applyUrlState = useCallback((nextUrl: string) => {
    setUrl(nextUrl)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeUrlChanged(applyUrlState)
    return unsubscribe
  }, [applyUrlState])

  useEffect(() => {
    return subscribeUiCommand((command) => {
      if (command.type === 'tab-limit-reached') {
        showTransientMessage(`最多可打开 ${command.limit} 个标签`)
        return
      }
      if (command.type === 'navigation-blocked') {
        const message = command.reason === 'insecure-http'
          ? '已阻止不安全的 HTTP 导航'
          : command.reason === 'invalid-url'
            ? '链接格式无效'
            : '已阻止不受支持的链接'
        showTransientMessage(message)
      }
    })
  }, [showTransientMessage])

  useEffect(() => {
    setBrowserSidebarWidth(sidebarWidth)
  }, [sidebarWidth])

  useEffect(() => {
    return () => {
      if (syncMessageTimer.current) clearTimeout(syncMessageTimer.current)
    }
  }, [])

  const navigateTo = useCallback((targetUrl: string) => {
    navigateBrowser(targetUrl)
  }, [])

  const navigateFromInput = useCallback((input: string) => {
    if (!input.trim()) return
    navigateTo(input)
  }, [navigateTo])

  const goHome = useCallback(() => {
    goBrowserHome()
    setUrl('algo://home')
  }, [])

  const goBack = useCallback(() => {
    goBrowserBack()
  }, [])

  const goForward = useCallback(() => {
    goBrowserForward()
  }, [])

  const reload = useCallback(() => {
    reloadBrowser()
  }, [])

  const syncCurrentPage = useCallback(async () => {
    setSyncMsg('同步中...')
    const result = await syncBrowserCurrentPage()
    showTransientMessage(result.error ? result.error : `已同步 ${result.inserted} 条`)
  }, [showTransientMessage])

  return {
    url,
    syncMsg,
    setUrl,
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
  }
}
