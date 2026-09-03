import { describe, test, beforeEach, afterEach } from 'vitest'
import assert from 'node:assert'
import { ProblemSessionTracker } from '../../electron/coach/ProblemSessionTracker'
import type { TrackingService } from '../../electron/tracking/TrackingService'
import type { ProblemIdentity } from '../../electron/shared/types'
import type { AppWindow } from '../../electron/windows/AppWindow'

/**
 * ProblemSessionTracker Issue #3 测试：problem_id 异步解析
 *
 * 测试范围：
 * 1. openNewSession 时触发 resolveProblemId 回调
 * 2. 首次提交时兜底触发 resolveProblemId 回调
 * 3. 异步解析成功后更新 current.problem_id
 * 4. 异步完成前用户切题，不更新已关闭 session 的 problem_id
 */

// --- Mock helpers ---

interface MockTrackingServiceOptions {
  onProblemDetected?: (identity: ProblemIdentity) => void
}

function createMockTrackingService(options: MockTrackingServiceOptions = {}): TrackingService {
  const listeners: Array<(identity: ProblemIdentity, source?: any) => void> = []
  return {
    addProblemDetectedListener: (fn) => {
      listeners.push(fn)
      return () => {
        const idx = listeners.indexOf(fn)
        if (idx >= 0) listeners.splice(idx, 1)
      }
    },
    emit: (identity: ProblemIdentity, source?: any) => {
      for (const fn of listeners) fn(identity, source)
    },
  } as any
}

function createMockAppWindow(id: string): AppWindow {
  const activeTabListeners: Array<(url: string) => void> = []
  let currentUrl = 'about:blank'

  return {
    id,
    browserWindow: {
      on: () => {},
      off: () => {},
      isFocused: () => true,
      isDestroyed: () => false,
    } as any,
    tabManager: {
      getUrl: () => currentUrl,
      setUrl: (url: string) => { currentUrl = url },
      addActiveTabChangeListener: (fn) => {
        activeTabListeners.push(fn)
        return () => {
          const idx = activeTabListeners.indexOf(fn)
          if (idx >= 0) activeTabListeners.splice(idx, 1)
        }
      },
      emitActiveTabChange: (url: string) => {
        currentUrl = url
        for (const fn of activeTabListeners) fn(url)
      },
    } as any,
  } as AppWindow
}

// --- Tests ---

describe('ProblemSessionTracker - Issue #3: problem_id 异步解析', () => {
  test('openNewSession 时触发 resolveProblemId 回调', async () => {
    let resolveCallCount = 0
    let capturedPlatform = ''
    let capturedPlatformProblemId = ''

    const tracker = new ProblemSessionTracker({
      trackingService: createMockTrackingService(),
      parseProblemUrl: (url) => {
        if (url.includes('leetcode.com/problems/two-sum')) {
          return { platform: 'leetcode', platformProblemId: 'two-sum', url }
        }
        return null
      },
      resolveProblemId: async (platform, platformProblemId) => {
        resolveCallCount += 1
        capturedPlatform = platform
        capturedPlatformProblemId = platformProblemId
        return 'problem-uuid-123'
      },
      now: () => 1000,
    })

    tracker.start()

    // 模拟进入题目页
    tracker.handleProblemDetectedForTest({
      platform: 'leetcode',
      platformProblemId: 'two-sum',
      url: 'https://leetcode.com/problems/two-sum',
    })

    // 立即检查：problem_id 应为 null（异步未完成）
    let session = tracker.getCurrentSession()
    assert.strictEqual(session?.problem_id, null)
    assert.strictEqual(session?.platform, 'leetcode')
    assert.strictEqual(session?.platform_problem_id, 'two-sum')

    // 回调应被触发
    assert.strictEqual(resolveCallCount, 1)
    assert.strictEqual(capturedPlatform, 'leetcode')
    assert.strictEqual(capturedPlatformProblemId, 'two-sum')

    // 等待异步完成
    await new Promise(resolve => setTimeout(resolve, 10))

    // problem_id 应已更新
    session = tracker.getCurrentSession()
    assert.strictEqual(session?.problem_id, 'problem-uuid-123')

    tracker.stop()
  })

  test('首次提交时兜底触发 resolveProblemId（problem_id 仍为 null）', async () => {
    let resolveCallCount = 0

    const tracker = new ProblemSessionTracker({
      trackingService: createMockTrackingService(),
      parseProblemUrl: (url) => {
        if (url.includes('codeforces.com')) {
          return { platform: 'codeforces', platformProblemId: '1234A', url }
        }
        return null
      },
      resolveProblemId: async (platform, platformProblemId) => {
        resolveCallCount += 1
        // 第一次调用返回 null（题目未入库）
        if (resolveCallCount === 1) return null
        // 第二次调用返回真实 ID（首次提交后题目已入库）
        return 'problem-uuid-456'
      },
      now: () => 1000,
    })

    tracker.start()

    // 进入题目页
    tracker.handleProblemDetectedForTest({
      platform: 'codeforces',
      platformProblemId: '1234A',
      url: 'https://codeforces.com/problemset/problem/1234/A',
    })

    await new Promise(resolve => setTimeout(resolve, 10))
    assert.strictEqual(resolveCallCount, 1)
    assert.strictEqual(tracker.getCurrentSession()?.problem_id, null)

    // 首次提交触发兜底解析
    tracker.recordSubmission('WA')

    await new Promise(resolve => setTimeout(resolve, 10))
    assert.strictEqual(resolveCallCount, 2)
    assert.strictEqual(tracker.getCurrentSession()?.problem_id, 'problem-uuid-456')

    tracker.stop()
  })

  test('异步完成前用户切题，不更新已关闭 session', async () => {
    let resolveDelay = 0

    const tracker = new ProblemSessionTracker({
      trackingService: createMockTrackingService(),
      parseProblemUrl: (url) => {
        if (url.includes('two-sum')) {
          return { platform: 'leetcode', platformProblemId: 'two-sum', url }
        }
        if (url.includes('three-sum')) {
          return { platform: 'leetcode', platformProblemId: 'three-sum', url }
        }
        return null
      },
      resolveProblemId: async (platform, platformProblemId) => {
        await new Promise(resolve => setTimeout(resolve, resolveDelay))
        return `problem-${platformProblemId}`
      },
      now: () => 1000,
    })

    tracker.start()

    // 进入第一题（解析耗时 50ms）
    resolveDelay = 50
    tracker.handleProblemDetectedForTest({
      platform: 'leetcode',
      platformProblemId: 'two-sum',
      url: 'https://leetcode.com/problems/two-sum',
    })

    const firstSessionId = tracker.getCurrentSession()?.session_id

    // 立即切到第二题（解析耗时 5ms）
    await new Promise(resolve => setTimeout(resolve, 5))
    resolveDelay = 5
    tracker.handleProblemDetectedForTest({
      platform: 'leetcode',
      platformProblemId: 'three-sum',
      url: 'https://leetcode.com/problems/three-sum',
    })

    const secondSessionId = tracker.getCurrentSession()?.session_id
    assert.notStrictEqual(firstSessionId, secondSessionId)

    // 等待所有异步完成
    await new Promise(resolve => setTimeout(resolve, 100))

    // 当前 session 应为第二题，problem_id 已解析
    const current = tracker.getCurrentSession()
    assert.strictEqual(current?.session_id, secondSessionId)
    assert.strictEqual(current?.problem_id, 'problem-three-sum')

    // 第一题在历史中，problem_id 应仍为 null（异步完成时 session 已关闭）
    const history = tracker.getSessionHistory()
    const firstSession = history.find(s => s.session_id === firstSessionId)
    assert.strictEqual(firstSession?.problem_id, null)

    tracker.stop()
  })

  test('resolveProblemId 未注入时静默处理', () => {
    const tracker = new ProblemSessionTracker({
      trackingService: createMockTrackingService(),
      parseProblemUrl: (url) => {
        if (url.includes('leetcode.com')) {
          return { platform: 'leetcode', platformProblemId: 'two-sum', url }
        }
        return null
      },
      // 未注入 resolveProblemId
      now: () => 1000,
    })

    tracker.start()

    // 进入题目页不应报错
    assert.doesNotThrow(() => {
      tracker.handleProblemDetectedForTest({
        platform: 'leetcode',
        platformProblemId: 'two-sum',
        url: 'https://leetcode.com/problems/two-sum',
      })
    })

    // problem_id 应保持 null
    const session = tracker.getCurrentSession()
    assert.strictEqual(session?.problem_id, null)

    // 首次提交也不应报错
    assert.doesNotThrow(() => {
      tracker.recordSubmission('AC')
    })

    assert.strictEqual(tracker.getCurrentSession()?.problem_id, null)

    tracker.stop()
  })

  test('resolveProblemId 返回 null 时保持 problem_id 为 null', async () => {
    const tracker = new ProblemSessionTracker({
      trackingService: createMockTrackingService(),
      parseProblemUrl: (url) => {
        if (url.includes('atcoder.jp')) {
          return { platform: 'atcoder', platformProblemId: 'abc123_a', url }
        }
        return null
      },
      resolveProblemId: async () => null, // 题目未入库
      now: () => 1000,
    })

    tracker.start()

    tracker.handleProblemDetectedForTest({
      platform: 'atcoder',
      platformProblemId: 'abc123_a',
      url: 'https://atcoder.jp/contests/abc123/tasks/abc123_a',
    })

    await new Promise(resolve => setTimeout(resolve, 10))

    // problem_id 应保持 null
    assert.strictEqual(tracker.getCurrentSession()?.problem_id, null)

    tracker.stop()
  })

  test('resolveProblemId 抛出异常时静默处理', async () => {
    const tracker = new ProblemSessionTracker({
      trackingService: createMockTrackingService(),
      parseProblemUrl: (url) => {
        if (url.includes('luogu.com.cn')) {
          return { platform: 'luogu', platformProblemId: 'P1001', url }
        }
        return null
      },
      resolveProblemId: async () => {
        throw new Error('Database connection failed')
      },
      now: () => 1000,
    })

    tracker.start()

    // 不应抛出异常
    assert.doesNotThrow(() => {
      tracker.handleProblemDetectedForTest({
        platform: 'luogu',
        platformProblemId: 'P1001',
        url: 'https://www.luogu.com.cn/problem/P1001',
      })
    })

    await new Promise(resolve => setTimeout(resolve, 10))

    // problem_id 应保持 null
    assert.strictEqual(tracker.getCurrentSession()?.problem_id, null)

    tracker.stop()
  })
})
