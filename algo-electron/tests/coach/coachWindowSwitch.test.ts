import { afterEach, describe, expect, it, vi } from 'vitest'
import { AsyncGenerationGate } from '../../electron/coach/AsyncGenerationGate.ts'
import { DebouncedWindowFollower } from '../../electron/coach/DebouncedWindowFollower.ts'

describe('DebouncedWindowFollower', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies only the final window in a rapid focus burst', () => {
    vi.useFakeTimers()
    const first = { id: 'window-a' }
    const second = { id: 'window-b' }
    const applied: string[] = []
    const follower = new DebouncedWindowFollower({
      delayMs: 200,
      onApply: (target) => applied.push(target?.id ?? 'none'),
    })

    follower.applyNow(first)
    follower.request(second)
    vi.advanceTimersByTime(100)
    follower.request(first)
    vi.advanceTimersByTime(200)

    expect(applied).toEqual(['window-a', 'window-a'])
  })

  it('cancels a pending switch when stopped', () => {
    vi.useFakeTimers()
    const applied: string[] = []
    const follower = new DebouncedWindowFollower({
      delayMs: 200,
      onApply: (target) => applied.push(target?.id ?? 'none'),
    })

    follower.request({ id: 'window-b' })
    follower.stop()
    vi.advanceTimersByTime(200)

    expect(applied).toEqual([])
  })
})

describe('AsyncGenerationGate', () => {
  it('discards a late result after a newer window request starts', async () => {
    const gate = new AsyncGenerationGate()
    let state: string | null = null
    let resolveOld!: (value: string) => void
    let resolveCurrent!: (value: string) => void
    const oldResult = new Promise<string>((resolve) => { resolveOld = resolve })
    const currentResult = new Promise<string>((resolve) => { resolveCurrent = resolve })

    const oldGeneration = gate.next()
    void oldResult.then((value) => gate.commit(oldGeneration, () => { state = value }))
    const currentGeneration = gate.next()
    void currentResult.then((value) => gate.commit(currentGeneration, () => { state = value }))

    resolveOld('window-b')
    await oldResult
    expect(state).toBeNull()

    resolveCurrent('window-a')
    await currentResult
    expect(state).toBe('window-a')
  })
})
