import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { toggleCoachIgnoreMouseEvents } from './coachDataApi'

export function useCoachMouseCapture() {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragStartedRef = useRef(false)
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const lastIgnoreRef = useRef<boolean | null>(null)

  const updateMouseCapture = useCallback((event?: Pick<MouseEvent, 'clientX' | 'clientY'>) => {
    if (event) pointerRef.current = { clientX: event.clientX, clientY: event.clientY }
    const pointer = pointerRef.current
    const regions = rootRef.current?.querySelectorAll<HTMLElement>('[data-coach-interactive]')
    const overControl = pointer && regions && Array.from(regions).some((region) => {
      const rect = region.getBoundingClientRect()
      return pointer.clientX >= rect.left && pointer.clientX < rect.right
        && pointer.clientY >= rect.top && pointer.clientY < rect.bottom
    })
    const ignore = !dragStartedRef.current && !overControl
    if (lastIgnoreRef.current === ignore) return
    lastIgnoreRef.current = ignore
    void toggleCoachIgnoreMouseEvents(ignore)
  }, [])

  useLayoutEffect(() => {
    updateMouseCapture()
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Electron forwards movement while click-through is on. Use coordinates so
    // changes to native hit testing cannot turn synthetic enter/leave into a loop.
    const trackPointer = (event: MouseEvent) => updateMouseCapture(event)
    const releasePointer = () => {
      pointerRef.current = null
      updateMouseCapture()
    }
    document.addEventListener('mousemove', trackPointer)
    document.addEventListener('mouseleave', trackPointer)
    window.addEventListener('blur', releasePointer)

    const resizeObserver = new ResizeObserver(() => updateMouseCapture())
    const observeRegions = () => {
      resizeObserver.disconnect()
      resizeObserver.observe(root)
      root.querySelectorAll('[data-coach-interactive]').forEach((region) => resizeObserver.observe(region))
      updateMouseCapture()
    }
    // Also release a stationary pointer when a bubble closes or a lazy panel changes.
    const mutationObserver = new MutationObserver(observeRegions)
    mutationObserver.observe(root, { childList: true, subtree: true })
    const remeasure = () => updateMouseCapture()
    root.addEventListener('transitionend', remeasure)
    root.addEventListener('animationend', remeasure)
    observeRegions()

    return () => {
      document.removeEventListener('mousemove', trackPointer)
      document.removeEventListener('mouseleave', trackPointer)
      window.removeEventListener('blur', releasePointer)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      root.removeEventListener('transitionend', remeasure)
      root.removeEventListener('animationend', remeasure)
      pointerRef.current = null
      lastIgnoreRef.current = true
      void toggleCoachIgnoreMouseEvents(true)
    }
  }, [updateMouseCapture])

  return { rootRef, dragStartedRef, updateMouseCapture }
}
