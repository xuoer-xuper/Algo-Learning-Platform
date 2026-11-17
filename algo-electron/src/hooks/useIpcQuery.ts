import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DataTable } from '@shared/types/data'
import { useDataRefresh } from '../context/data-refresh-context'

function sameDependencies(left: readonly unknown[], right: readonly unknown[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  )
}

export function useIpcQuery<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  { tables = [], enabled = true }: { tables?: readonly DataTable[]; enabled?: boolean } = {},
) {
  const { onDataRefresh } = useDataRefresh()
  const [identity, setIdentity] = useState(deps)
  if (!sameDependencies(identity, deps)) setIdentity(deps)
  const tableKey = [...new Set(tables)].sort().join(',')
  const fetcherRef = useRef(fetcher)
  useLayoutEffect(() => {
    fetcherRef.current = fetcher
  })
  const current = useRef({ generation: 0, identityVersion: 0, active: false, hasData: false })
  const [state, setState] = useState<{
    identity: readonly unknown[]
    data: T | undefined
    isLoading: boolean
    isRefetching: boolean
    error: Error | null
  }>({ identity, data: undefined, isLoading: enabled, isRefetching: false, error: null })

  const refetch = useCallback(async (): Promise<T | undefined> => {
    const query = current.current
    if (!query.active) return undefined
    const generation = ++query.generation
    const identityVersion = query.identityVersion
    setState((value) => ({
      ...value,
      isLoading: !query.hasData,
      isRefetching: query.hasData,
      error: null,
    }))
    try {
      const data = await fetcherRef.current()
      if (!query.active || identityVersion !== query.identityVersion) return undefined
      // Same-key callers may need their result after a newer background request starts.
      if (generation !== query.generation) return data
      query.hasData = true
      setState((value) => ({ ...value, data, isLoading: false, isRefetching: false, error: null }))
      return data
    } catch (cause) {
      if (query.active && generation === query.generation) {
        const error = cause instanceof Error ? cause : new Error(String(cause))
        setState((value) => ({ ...value, error, isLoading: false, isRefetching: false }))
      }
      return undefined
    }
  }, [])

  // Invalidate before passive effects so an old request cannot settle into a new key.
  useLayoutEffect(() => {
    const query = current.current
    query.active = enabled
    query.hasData = false
    query.identityVersion += 1
    query.generation += 1
    setState({ identity, data: undefined, isLoading: enabled, isRefetching: false, error: null })
    return () => {
      query.active = false
      query.identityVersion += 1
      query.generation += 1
    }
  }, [identity, enabled])

  useEffect(() => {
    if (!enabled) return
    const relevantTables = new Set(tableKey.split(','))
    const unsubscribe = onDataRefresh(({ tables: changed }) => {
      if (changed.some((table) => relevantTables.has(table))) void refetch()
    })
    void refetch()
    return unsubscribe
  }, [identity, enabled, tableKey, onDataRefresh, refetch])

  const isCurrent = sameDependencies(state.identity, identity)
  return {
    data: isCurrent ? state.data : undefined,
    error: isCurrent ? state.error : null,
    isLoading: enabled && (!isCurrent || state.isLoading),
    isRefetching: enabled && isCurrent && state.isRefetching,
    refetch,
  }
}
