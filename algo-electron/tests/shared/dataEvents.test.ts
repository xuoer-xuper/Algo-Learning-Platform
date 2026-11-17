import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  emitDataChanged,
  subscribeDataChanges,
  withDataChangeTransaction,
} from '../../electron/shared/dataEvents'
import { installDataRefreshBridge } from '../../electron/shared/dataRefreshBridge'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'
import { dataChangedPayloadSchema, type DataChangedPayload } from '../../src/shared/types/data'
import { logger } from '../../electron/shared/logger'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function observe(): DataChangedPayload[] {
  const payloads: DataChangedPayload[] = []
  cleanup.push(subscribeDataChanges((payload) => payloads.push(payload)))
  return payloads
}

describe('data change transactions', () => {
  it('should emit deduplicated topics only after the outer operation commits', () => {
    const payloads = observe()
    const result = withDataChangeTransaction(() => {
      emitDataChanged(['problems', 'stats'])
      withDataChangeTransaction(() => emitDataChanged(['submissions', 'stats']))
      expect(payloads).toEqual([])
      return 42
    })
    expect(result).toBe(42)
    expect(payloads).toEqual([{ tables: ['problems', 'stats', 'submissions'] }])
  })

  it('should discard successful nested changes when the outer operation rolls back', () => {
    const payloads = observe()
    expect(() =>
      withDataChangeTransaction(() => {
        emitDataChanged(['problems'])
        withDataChangeTransaction(() => emitDataChanged(['submissions']))
        throw new Error('commit failed')
      }),
    ).toThrow('commit failed')
    expect(payloads).toEqual([])
    emitDataChanged(['notes'])
    expect(payloads).toEqual([{ tables: ['notes'] }])
  })

  it('should discard only a rolled-back inner scope when the outer scope continues', () => {
    const payloads = observe()
    withDataChangeTransaction(() => {
      emitDataChanged(['problems'])
      expect(() =>
        withDataChangeTransaction(() => {
          emitDataChanged(['scripts'])
          throw new Error('savepoint failed')
        }),
      ).toThrow('savepoint failed')
      emitDataChanged(['stats'])
    })
    expect(payloads).toEqual([{ tables: ['problems', 'stats'] }])
  })

  it('should not emit for an empty scope or empty topics', () => {
    const payloads = observe()
    withDataChangeTransaction(() => undefined)
    emitDataChanged([])
    expect(payloads).toEqual([])
  })

  it('should preserve earlier autocommit notifications after a later failure', () => {
    const payloads = observe()
    expect(() => {
      emitDataChanged(['problems'])
      throw new Error('next item failed')
    }).toThrow('next item failed')
    expect(payloads).toEqual([{ tables: ['problems'] }])
  })

  it('should isolate failed listeners and leave the transaction stack usable', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    cleanup.push(
      subscribeDataChanges(() => {
        throw new Error('private content')
      }),
    )
    const payloads = observe()
    expect(() => withDataChangeTransaction(() => emitDataChanged(['notes']))).not.toThrow()
    emitDataChanged(['scripts'])
    expect(payloads).toEqual([{ tables: ['notes'] }, { tables: ['scripts'] }])
    expect(warn).toHaveBeenCalledWith('data-events.listener-failed')
    expect(warn.mock.calls.flat()).not.toContain('private content')
  })

  it('should unsubscribe idempotently', () => {
    const listener = vi.fn()
    const dispose = subscribeDataChanges(listener)
    dispose()
    dispose()
    emitDataChanged(['coach'])
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('data refresh bridge', () => {
  it('should coalesce a fixed 50ms window without starving continuous writes', () => {
    vi.useFakeTimers()
    const sendToAll = vi.fn()
    cleanup.push(installDataRefreshBridge({ sendToAll }))
    emitDataChanged(['problems', 'stats'])
    vi.advanceTimersByTime(30)
    emitDataChanged(['submissions', 'stats'])
    vi.advanceTimersByTime(19)
    expect(sendToAll).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(sendToAll).toHaveBeenCalledExactlyOnceWith(IPC_CHANNELS.DATA.CHANGED, {
      tables: ['problems', 'stats', 'submissions'],
    })
    emitDataChanged(['notes'])
    vi.advanceTimersByTime(50)
    expect(sendToAll).toHaveBeenCalledTimes(2)
  })

  it('should cancel pending broadcasts and release the subscription on disposal', () => {
    vi.useFakeTimers()
    const sendToAll = vi.fn()
    const dispose = installDataRefreshBridge({ sendToAll })
    cleanup.push(dispose)
    emitDataChanged(['notes'])
    dispose()
    dispose()
    emitDataChanged(['stats'])
    vi.runAllTimers()
    expect(sendToAll).not.toHaveBeenCalled()
  })

  it('should log broadcast failures without uncaught timer errors or private payloads', () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    cleanup.push(
      installDataRefreshBridge({
        sendToAll: () => {
          throw new Error('private')
        },
      }),
    )
    emitDataChanged(['credentials'])
    expect(() => vi.runAllTimers()).not.toThrow()
    expect(warn).toHaveBeenCalledExactlyOnceWith('data-refresh.broadcast-failed')
  })

  it('should constrain payloads to the eight public invalidation topics', () => {
    expect(dataChangedPayloadSchema.safeParse({ tables: ['credentials', 'stats'] }).success).toBe(
      true,
    )
    expect(dataChangedPayloadSchema.safeParse({ tables: ['cookies'] }).success).toBe(false)
  })
})
