import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'

export function useIpcSubscription<T>(
  read: () => Promise<T>,
  subscribe: (listener: (value: T) => void) => () => void,
  initialValue: T,
) {
  const [value, setValue] = useState(() => initialValue)
  const revision = useRef(0)
  const update = useCallback((next: SetStateAction<T>) => {
    revision.current += 1
    setValue(next)
  }, [])
  useEffect(() => {
    let disposed = false
    const initialRevision = revision.current
    const unsubscribe = subscribe((next) => {
      if (!disposed) update(() => next)
    })
    void read()
      .then((next) => {
        if (!disposed && initialRevision === revision.current) setValue(() => next)
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [read, subscribe, update])
  return [value, update] as const
}
