import { useLayoutEffect, useState, type ReactNode } from 'react'
import { subscribeDataChanged } from '../hooks/dataRefreshApi'
import { DataRefreshContext, type DataRefreshListener } from './data-refresh-context'

export function DataRefreshProvider({
  children,
  subscribe = subscribeDataChanged,
}: {
  children: ReactNode
  subscribe?: (listener: DataRefreshListener) => () => void
}) {
  const [listeners] = useState(() => new Set<DataRefreshListener>())
  const [context] = useState(() => ({
    onDataRefresh(listener: DataRefreshListener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }))

  useLayoutEffect(
    () =>
      subscribe((payload) => {
        for (const listener of [...listeners]) listener(payload)
      }),
    [listeners, subscribe],
  )

  return <DataRefreshContext.Provider value={context}>{children}</DataRefreshContext.Provider>
}
