import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dismissRendererError,
  installRendererErrorHandlers,
  reportRendererError,
  resetRendererErrorsForTest,
  subscribeRendererErrors,
  type RendererErrorReport,
} from '../../src/rendererErrors'
import { errorMessage } from '../../src/shared/errors'

/** 最小 EventTarget 替身：只记录注册的监听器，便于直接投递事件。 */
function createTarget() {
  const listeners = new Set<(event: PromiseRejectionEvent) => void>()
  return {
    listenerCount: () => listeners.size,
    dispatch(reason: unknown) {
      for (const listener of listeners) {
        listener({ reason } as PromiseRejectionEvent)
      }
    },
    addEventListener(_type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void) {
      listeners.add(listener)
    },
    removeEventListener(_type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void) {
      listeners.delete(listener)
    },
  }
}

beforeEach(() => {
  resetRendererErrorsForTest()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetRendererErrorsForTest()
  vi.restoreAllMocks()
})

describe('rendererErrors', () => {
  it('未处理 rejection 转成带区域名的报告', () => {
    const target = createTarget()
    const seen: Array<RendererErrorReport | null> = []
    installRendererErrorHandlers(target)
    subscribeRendererErrors((report) => seen.push(report))

    target.dispatch(new Error('IPC 通道未注册'))

    expect(seen).toEqual([{ scope: '应用', message: 'IPC 通道未注册', count: 1 }])
  })

  it('保留 console 输出，且不吞掉原始 error 对象', () => {
    const target = createTarget()
    const original = new Error('读取失败')
    installRendererErrorHandlers(target)

    target.dispatch(original)

    // 传原始对象而非字符串，DevTools 里才能展开 stack。
    expect(console.error).toHaveBeenCalledWith('[renderer] 应用 失败:', original)
  })

  it('挂载前发生的错误在订阅时补发', () => {
    // App 挂载晚于入口安装监听：首屏读取失败必须能追上，否则最该报的一类会丢。
    reportRendererError('题目侧栏读取', new Error('database is locked'))

    const seen: Array<RendererErrorReport | null> = []
    subscribeRendererErrors((report) => seen.push(report))

    expect(seen).toEqual([{ scope: '题目侧栏读取', message: 'database is locked', count: 1 }])
  })

  it('同一错误重复出现只累加次数', () => {
    const seen: Array<RendererErrorReport | null> = []
    subscribeRendererErrors((report) => seen.push(report))

    reportRendererError('统计趋势读取', new Error('timeout'))
    reportRendererError('统计趋势读取', new Error('timeout'))

    expect(seen.at(-1)).toEqual({ scope: '统计趋势读取', message: 'timeout', count: 2 })
  })

  it('不同区域的错误覆盖为最新一条', () => {
    const seen: Array<RendererErrorReport | null> = []
    subscribeRendererErrors((report) => seen.push(report))

    reportRendererError('首页概览读取', new Error('timeout'))
    reportRendererError('笔记列表读取', new Error('timeout'))

    expect(seen.at(-1)).toEqual({ scope: '笔记列表读取', message: 'timeout', count: 1 })
  })

  it('关闭通知后推送 null，重复关闭不重复通知', () => {
    const seen: Array<RendererErrorReport | null> = []
    reportRendererError('设置页概览读取', new Error('boom'))
    subscribeRendererErrors((report) => seen.push(report))

    dismissRendererError()
    dismissRendererError()

    expect(seen).toEqual([
      { scope: '设置页概览读取', message: 'boom', count: 1 },
      null,
    ])
  })

  it('退订后不再收到推送', () => {
    const seen: Array<RendererErrorReport | null> = []
    const unsubscribe = subscribeRendererErrors((report) => seen.push(report))
    unsubscribe()

    reportRendererError('站点列表读取', new Error('boom'))

    expect(seen).toEqual([])
  })

  it('卸载监听后 rejection 不再上报', () => {
    const target = createTarget()
    const dispose = installRendererErrorHandlers(target)
    dispose()

    expect(target.listenerCount()).toBe(0)
  })
})

describe('errorMessage', () => {
  it('Error 取 message，空 message 退回 name', () => {
    expect(errorMessage(new Error('失败原因'))).toBe('失败原因')
    expect(errorMessage(new TypeError(''))).toBe('TypeError')
  })

  it('普通对象序列化而不是 [object Object]', () => {
    // 主进程返回的结构化错误走这条分支；原先各面板的 String(e) 会丢掉全部信息。
    expect(errorMessage({ code: 'SQLITE_BUSY' })).toBe('{"code":"SQLITE_BUSY"}')
  })

  it('空值与循环引用有可读回退', () => {
    expect(errorMessage(null)).toBe('未知错误')
    expect(errorMessage(undefined)).toBe('未知错误')
    expect(errorMessage('')).toBe('未知错误')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(errorMessage(circular)).toBe('[object Object]')
  })
})
