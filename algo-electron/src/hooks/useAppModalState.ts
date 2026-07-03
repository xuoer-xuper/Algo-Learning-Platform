import { useCallback, useState } from 'react'

interface UseAppModalStateOptions {
  isHome: boolean
}

export function useAppModalState({ isHome }: UseAppModalStateOptions) {
  const [showSettings, setShowSettings] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [showScripts, setShowScripts] = useState(false)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [notesProblemId, setNotesProblemId] = useState<string | null>(null)
  const [modalBackdrop, setModalBackdrop] = useState<string | null>(null)

  const prepareModal = useCallback(async () => {
    if (!isHome) {
      const preview = await window.electronAPI.captureBrowserPreview()
      setModalBackdrop(preview)
      window.electronAPI.hideView()
      return
    }

    setModalBackdrop(null)
  }, [isHome])

  const closeModalBackdrop = useCallback(() => {
    setModalBackdrop(null)
    if (!isHome) {
      window.electronAPI.showView()
    }
  }, [isHome])

  const openSettings = useCallback(async () => {
    await prepareModal()
    setShowSettings(true)
  }, [prepareModal])

  const closeSettings = useCallback(() => {
    closeModalBackdrop()
    setShowSettings(false)
  }, [closeModalBackdrop])

  const openDashboard = useCallback(async () => {
    await prepareModal()
    setShowDashboard(true)
  }, [prepareModal])

  const closeDashboard = useCallback(() => {
    closeModalBackdrop()
    setShowDashboard(false)
  }, [closeModalBackdrop])

  const openScripts = useCallback(async () => {
    await prepareModal()
    setShowScripts(true)
  }, [prepareModal])

  const closeScripts = useCallback(() => {
    closeModalBackdrop()
    setShowScripts(false)
  }, [closeModalBackdrop])

  const openProblemDetail = useCallback(async (problemId: string) => {
    await prepareModal()
    setSelectedProblemId(problemId)
  }, [prepareModal])

  const closeProblemDetail = useCallback(() => {
    closeModalBackdrop()
    setSelectedProblemId(null)
  }, [closeModalBackdrop])

  const openNotes = useCallback(async (problemId: string) => {
    await prepareModal()
    setNotesProblemId(problemId)
  }, [prepareModal])

  const closeNotes = useCallback(() => {
    closeModalBackdrop()
    setNotesProblemId(null)
  }, [closeModalBackdrop])

  return {
    showSettings,
    showDashboard,
    showScripts,
    selectedProblemId,
    notesProblemId,
    modalBackdrop,
    openSettings,
    closeSettings,
    openDashboard,
    closeDashboard,
    openScripts,
    closeScripts,
    openProblemDetail,
    closeProblemDetail,
    openNotes,
    closeNotes,
  }
}
