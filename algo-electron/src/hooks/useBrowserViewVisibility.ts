import { useEffect } from 'react'
import { hideBrowserView, showBrowserView } from './browserShellApi'

interface UseBrowserViewVisibilityOptions {
  isHome: boolean
  modalBackdrop: string | null
}

export function useBrowserViewVisibility({
  isHome,
  modalBackdrop,
}: UseBrowserViewVisibilityOptions) {
  useEffect(() => {
    if (isHome) {
      hideBrowserView()
      return
    }

    if (!modalBackdrop) {
      showBrowserView()
    }
  }, [isHome, modalBackdrop])
}
