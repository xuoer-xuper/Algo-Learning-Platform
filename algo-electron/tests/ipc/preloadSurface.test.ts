import assert from 'node:assert'
import { beforeAll, describe, test } from 'vitest'
import { ipcRenderer } from 'electron'
import { exposedMainWorld, resetElectronMock } from '../electron/electronMock'

/**
 * preload 暴露面的运行时验证。
 *
 * 与 ipcContracts.test.ts 的分工：那边是文本扫描，逐条核对方法名与频道名的
 * 对应表；这边真的 import 一次 preload、把暴露出来的每个函数都调一遍，看它
 * 实际往 ipcRenderer 上发了什么。文本扫描抓不到的三类问题只有这里能抓：
 *   - 表里有名字但对象上没有这个键（漏实现）；
 *   - on* 订阅返回的退订函数没真的摘掉监听器；
 *   - 订阅回调收到了 event 而不是 payload（subscribe 包装层写错）。
 *
 * R3 起暴露面是域分组的 `window.api`（`browser` / `tab` / … 16 个域 +
 * `browserLayout` 布局常量）。多参数 invoke 已收成单对象参数，所以每个方法
 * 至多转发一个实参——这条不变量本身就是本测试的断言之一。
 *
 * 这也是 preload 进覆盖率的前提：它是纯副作用模块，没有导出，
 * 唯一能观察的就是 contextBridge 收到了什么（见 electronMock 的 exposedMainWorld）。
 */

type ApiRecord = Record<string, unknown>

/** 非订阅方法统一用这个哨兵实参调用：对象方法原样转发它，标量方法也原样转发它。 */
const SENTINEL = Object.freeze({ 'ipc-sentinel': true }) as unknown as string

interface IpcCall {
  kind: 'send' | 'invoke'
  channel: string
  args: unknown[]
}

interface Surface {
  /** 域名 → 方法名。`browserLayout` 是唯一不在任何域里的成员。 */
  methods: Map<string, string[]>
  subscriptions: Map<string, string[]>
}

let surface: Surface

beforeAll(async () => {
  resetElectronMock()
  await import('../../src/preload/index')
  const exposed = exposedMainWorld.get('api')
  assert.ok(exposed && typeof exposed === 'object', 'preload 必须向 main world 暴露 api')
  const api = exposed as ApiRecord

  const methods = new Map<string, string[]>()
  const subscriptions = new Map<string, string[]>()
  for (const [domain, value] of Object.entries(api)) {
    if (domain === 'browserLayout') continue
    assert.ok(
      value && typeof value === 'object',
      `${domain} 应是域对象（browserLayout 是唯一的非函数顶层成员）`,
    )
    const names: string[] = []
    const subscriptionNames: string[] = []
    for (const [method, fn] of Object.entries(value as ApiRecord)) {
      assert.strictEqual(typeof fn, 'function', `${domain}.${method} 应是函数`)
      if (/^on[A-Z]/.test(method)) subscriptionNames.push(method)
      else names.push(method)
    }
    methods.set(domain, names)
    subscriptions.set(domain, subscriptionNames)
  }
  surface = { methods, subscriptions }
})

/** 录一段 IPC 流量。send / invoke 都由 electronMock 广播成可观察事件 */
function recordIpc(run: () => void): IpcCall[] {
  const calls: IpcCall[] = []
  const onSend = (channel: unknown, ...args: unknown[]) => {
    calls.push({ kind: 'send', channel: String(channel), args })
  }
  const onInvoke = (channel: unknown, ...args: unknown[]) => {
    calls.push({ kind: 'invoke', channel: String(channel), args })
  }
  ipcRenderer.on('send', onSend)
  ipcRenderer.on('invoke', onInvoke)
  try {
    run()
  } finally {
    ipcRenderer.off('send', onSend)
    ipcRenderer.off('invoke', onInvoke)
  }
  return calls
}

describe('preload 暴露面', () => {
  test('api 只暴露白名单能力与域对象，不含通用 IPC 通道', () => {
    const exposed = exposedMainWorld.get('api') as ApiRecord
    // 守卫已按文本拦过一次（test:architecture 的 preload does not expose generic
    // ipcRenderer），这里从运行时对象再确认一遍：文本扫描看不到属性是怎么算出来的。
    for (const forbidden of ['ipcRenderer', 'send', 'invoke', 'on', 'off', 'require', 'process']) {
      assert.ok(!(forbidden in exposed), `api 不得暴露 ${forbidden}`)
    }
    // browserLayout 是唯一的非函数成员：同步读取的布局常量，不是 IPC 调用。
    assert.strictEqual(typeof exposed.browserLayout, 'object')
    const domains = Object.entries(exposed).filter(([key]) => key !== 'browserLayout')
    assert.strictEqual(domains.length, 16, `应有 16 个域，实测 ${domains.length}`)
  })

  test('每个方法各自只发一条 IPC，且至多转发一个实参（单对象 wire）', () => {
    let methodCount = 0
    const seen = new Map<string, string>()

    for (const [domain, methods] of surface.methods) {
      assert.ok(methods.length > 0, `${domain} 域不应为空`)
      for (const method of methods) {
        methodCount++
        const domainObject = (exposedMainWorld.get('api') as ApiRecord)[domain] as ApiRecord
        const fn = domainObject[method] as (...args: unknown[]) => unknown
        const calls = recordIpc(() => {
          void fn(SENTINEL)
        })
        assert.strictEqual(
          calls.length,
          1,
          `${domain}.${method} 应恰好触发一条 IPC，实测 ${calls.length} 条`,
        )
        const [call] = calls
        assert.ok(
          call.channel.includes(':'),
          `${domain}.${method} 的频道名应带命名空间前缀，实测 ${call.channel}`,
        )

        // R3 wire 形状：单对象参数。没有任何方法转发两个及以上实参——
        // 多参回归（哪怕只是漏改一个方法）会在这里当场爆出来。
        assert.ok(
          call.args.length <= 1,
          `${domain}.${method} 转发了 ${call.args.length} 个实参，wire 形状必须是单对象`,
        )
        if (call.args.length === 1) {
          assert.strictEqual(
            call.args[0],
            SENTINEL,
            `${domain}.${method} 必须原样转发实参（多参 invoke 在本阶段已收成单对象）`,
          )
        }

        // 同一频道被两个方法用同一种模式占着，通常是复制粘贴漏改。
        const key = `${call.kind} ${call.channel}`
        const previous = seen.get(key)
        assert.strictEqual(previous, undefined, `${domain}.${method} 与 ${previous} 共用 ${key}`)
        seen.set(key, `${domain}.${method}`)
      }
    }

    assert.ok(methodCount > 100, `暴露面应有 100+ 个非订阅方法，实测 ${methodCount}`)
  })

  test('订阅型方法收得到 payload，退订后不再收', () => {
    let subscriptionCount = 0

    for (const [domain, methods] of surface.subscriptions) {
      for (const method of methods) {
        subscriptionCount++
        // 订阅用的频道名要从 ipcRenderer 的监听器表里反查——preload 没把它暴露出来。
        const received: unknown[][] = []
        const before = new Set(ipcRenderer.eventNames().map(String))
        const domainObject = (exposedMainWorld.get('api') as ApiRecord)[domain] as ApiRecord
        const dispose = (
          domainObject[method] as (callback: (...args: unknown[]) => void) => unknown
        )((...args: unknown[]) => {
          received.push(args)
        })
        const added = ipcRenderer
          .eventNames()
          .map(String)
          .filter((name) => !before.has(name))
        assert.strictEqual(
          added.length,
          1,
          `${domain}.${method} 应只注册一个频道，实测 ${added.length} 个`,
        )
        const channel = added[0]
        assert.ok(
          channel.includes(':'),
          `${domain}.${method} 的频道名应带命名空间前缀，实测 ${channel}`,
        )
        assert.strictEqual(typeof dispose, 'function', `${domain}.${method} 必须返回退订函数`)

        ipcRenderer.emit(channel, { sender: 'ipc-event' }, 'payload-1')
        assert.strictEqual(received.length, 1, `${domain}.${method} 的回调应被调用一次`)
        // subscribe 包装必须把 IpcRendererEvent 剥掉：第一个实参是 payload 而不是 event。
        // 这是 preload 最容易写错的一处，文本扫描看不出来。
        assert.strictEqual(
          received[0][0],
          'payload-1',
          `${domain}.${method} 应把 payload 而非 event 传给回调`,
        )

        ;(dispose as () => void)()
        assert.strictEqual(
          ipcRenderer.listenerCount(channel),
          0,
          `${domain}.${method} 退订后 ${channel} 上不应还留着监听器`,
        )
        ipcRenderer.emit(channel, { sender: 'ipc-event' }, 'payload-2')
        assert.strictEqual(received.length, 1, `${domain}.${method} 退订后不应再收到事件`)
      }
    }

    assert.ok(subscriptionCount >= 17, `订阅型方法应有 17+ 个，实测 ${subscriptionCount}`)
  })
})
