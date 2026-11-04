import { createContext, useContext } from 'react'
import type { DataChangedPayload } from '@shared/types/data'

export type DataRefreshListener = (payload: DataChangedPayload) => void

export const DataRefreshContext = createContext<{
  onDataRefresh: (listener: DataRefreshListener) => () => void
} | null>(null)

export function useDataRefresh() {
  const context = useContext(DataRefreshContext)
  if (!context) throw new Error('DataRefreshProvider is required for IPC queries')
  return context
}
