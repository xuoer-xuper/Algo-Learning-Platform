// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataRefreshProvider } from '../../src/context/DataRefreshContext'
import { useIpcQuery } from '../../src/hooks/useIpcQuery'
import { useIpcSubscription } from '../../src/hooks/useIpcSubscription'
import type { DataChangedPayload } from '../../src/shared/types/data'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function eventFixture() {
  const listeners = new Set<(payload: DataChangedPayload) => void>()
  const unsubscribe = vi.fn()
  const subscribe = vi.fn((listener: (payload: DataChangedPayload) => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      unsubscribe()
    }
  })
  function wrapper({ children }: { children: ReactNode }) {
    return <DataRefreshProvider subscribe={subscribe}>{children}</DataRefreshProvider>
  }
  return {
    wrapper,
    subscribe,
    unsubscribe,
    listeners,
    emit: (tables: DataChangedPayload['tables']) => {
      for (const listener of listeners) listener({ tables })
    },
  }
}

afterEach(cleanup)

describe('useIpcQuery', () => {
  it('should retain data during a relevant refresh and ignore unrelated tables', async () => {
    const events = eventFixture()
    const next = deferred<number>()
    const fetcher = vi.fn().mockResolvedValueOnce(3).mockReturnValueOnce(next.promise)
    const { result } = renderHook(() => useIpcQuery(fetcher, [], { tables: ['stats'] }), {
      wrapper: events.wrapper,
    })
    await waitFor(() => expect(result.current.data).toBe(3))
    act(() => events.emit(['notes']))
    expect(fetcher).toHaveBeenCalledTimes(1)
    act(() => events.emit(['stats']))
    expect(result.current.data).toBe(3)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefetching).toBe(true)
    await act(async () => {
      next.resolve(4)
    })
    expect(result.current.data).toBe(4)
    expect(result.current.isRefetching).toBe(false)
  })

  it.each([{ value: null }, { value: false }, { value: 0 }, { value: [] }])(
    'should treat $value as successfully loaded data',
    async ({ value }) => {
      const events = eventFixture()
      const next = deferred<unknown>()
      const fetcher = vi.fn().mockResolvedValueOnce(value).mockReturnValue(next.promise)
      const { result } = renderHook(() => useIpcQuery(fetcher, [], { tables: ['stats'] }), {
        wrapper: events.wrapper,
      })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      act(() => events.emit(['stats']))
      expect(result.current.data).toEqual(value)
      expect(result.current.isRefetching).toBe(true)
      expect(result.current.isLoading).toBe(false)
    },
  )

  it('should let an invalidation supersede an initial request and ignore stale results', async () => {
    const events = eventFixture()
    const first = deferred<string>()
    const second = deferred<string>()
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useIpcQuery(fetcher, [], { tables: ['problems'] }), {
      wrapper: events.wrapper,
    })
    act(() => events.emit(['problems']))
    await act(async () => {
      second.resolve('new')
    })
    await act(async () => {
      first.resolve('old')
    })
    expect(result.current.data).toBe('new')
  })

  it('should clear old entity data on key change and use the latest fetcher without render loops', async () => {
    const events = eventFixture()
    const old = deferred<string>()
    const fetcher = vi.fn((id: string) => (id === 'a' ? old.promise : Promise.resolve(id)))
    const { result, rerender } = renderHook(
      ({ id }) => useIpcQuery(() => fetcher(id), [id], { tables: ['stats', 'problems'] }),
      { wrapper: events.wrapper, initialProps: { id: 'a' } },
    )
    rerender({ id: 'b' })
    await waitFor(() => expect(result.current.data).toBe('b'))
    await act(async () => {
      old.resolve('a')
    })
    expect(result.current.data).toBe('b')
    rerender({ id: 'b' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('should retain data and expose refresh errors without rejecting automatic work', async () => {
    const events = eventFixture()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('retained')
      .mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useIpcQuery(fetcher, [], { tables: ['stats'] }), {
      wrapper: events.wrapper,
    })
    await waitFor(() => expect(result.current.data).toBe('retained'))
    act(() => events.emit(['stats']))
    await waitFor(() => expect(result.current.error?.message).toBe('offline'))
    expect(result.current.data).toBe('retained')
    expect(result.current.isRefetching).toBe(false)
  })

  it('should return a same-key manual result without overwriting a newer background result', async () => {
    const events = eventFixture()
    const manual = deferred<string[]>()
    const background = deferred<string[]>()
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(manual.promise)
      .mockReturnValueOnce(background.promise)
    const { result } = renderHook(() => useIpcQuery(fetcher, [], { tables: ['scripts'] }), {
      wrapper: events.wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let returned: Promise<string[] | undefined> | undefined
    act(() => {
      returned = result.current.refetch()
    })
    act(() => events.emit(['scripts']))
    await act(async () => {
      background.resolve(['imported', 'newer'])
    })
    await act(async () => {
      manual.resolve(['imported'])
    })
    expect(await returned).toEqual(['imported'])
    expect(result.current.data).toEqual(['imported', 'newer'])
  })

  it('should stop on disable and unmount including previously pending requests', async () => {
    const events = eventFixture()
    const pending = deferred<string>()
    const fetcher = vi.fn().mockReturnValue(pending.promise)
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useIpcQuery(fetcher, [], { tables: ['stats'], enabled }),
      { wrapper: events.wrapper, initialProps: { enabled: false } },
    )
    expect(fetcher).not.toHaveBeenCalled()
    rerender({ enabled: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
    rerender({ enabled: false })
    await act(async () => {
      pending.resolve('stale')
      await result.current.refetch()
      events.emit(['stats'])
    })
    expect(result.current.data).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
    unmount()
    expect(events.listeners.size).toBe(0)
  })

  it('should keep one native listener after StrictMode remount and unsubscribe on cleanup', async () => {
    const events = eventFixture()
    const { unmount } = renderHook(() => useIpcQuery(async () => 1, []), {
      wrapper: ({ children }) => (
        <StrictMode>
          <events.wrapper>{children}</events.wrapper>
        </StrictMode>
      ),
    })
    await waitFor(() => expect(events.listeners.size).toBe(1))
    const mountedSubscriptions = events.subscribe.mock.calls.length
    expect(mountedSubscriptions).toBeGreaterThanOrEqual(1)
    expect(events.unsubscribe).toHaveBeenCalledTimes(mountedSubscriptions - 1)
    unmount()
    expect(events.listeners.size).toBe(0)
    expect(events.unsubscribe).toHaveBeenCalledTimes(mountedSubscriptions)
  })
})

describe('useIpcSubscription', () => {
  it('should subscribe before reading and keep a live update over a late snapshot', async () => {
    const snapshot = deferred<string>()
    let listener: (value: string) => void = () => {}
    const subscribe = vi.fn((handler: typeof listener) => {
      listener = handler
      return vi.fn()
    })
    const read = vi.fn(() => {
      expect(subscribe).toHaveBeenCalled()
      return snapshot.promise
    })
    const { result } = renderHook(() => useIpcSubscription(read, subscribe, 'initial'))
    act(() => listener('live'))
    await act(async () => {
      snapshot.resolve('old')
    })
    expect(result.current[0]).toBe('live')
  })

  it('should ignore snapshots from replaced subscriptions and explicit dismissal', async () => {
    const first = deferred<string | null>()
    const second = deferred<string | null>()
    const unsubscribe = vi.fn()
    const subscribe = () => unsubscribe
    const readFirst = () => first.promise
    const readSecond = () => second.promise
    const { result, rerender, unmount } = renderHook(
      ({ read }) => useIpcSubscription(read, subscribe, null),
      { initialProps: { read: readFirst } },
    )
    rerender({ read: readSecond })
    await act(async () => {
      first.resolve('old')
    })
    expect(result.current[0]).toBeNull()
    act(() => result.current[1](null))
    await act(async () => {
      second.resolve('dismissed')
    })
    expect(result.current[0]).toBeNull()
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('should store function payloads without invoking them', async () => {
    const value = vi.fn()
    const read = async () => value
    const subscribe = () => () => {}
    const { result } = renderHook(() => useIpcSubscription(read, subscribe, value))
    await waitFor(() => expect(result.current[0]).toBe(value))
    expect(value).not.toHaveBeenCalled()
  })
})
