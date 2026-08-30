import assert from 'node:assert'
import { beforeAll, describe, test } from 'vitest'
import { exposedMainWorld, ipcRenderer, resetElectronMock } from 'electron'

/**
 * preload 暴露面的运行时验证。
 *
 * 与 ipcContracts.test.ts 的分工：那边是文本扫描，逐条核对方法名与频道名的
 * 对应表；这边真的 import 一次 preload、把暴露出来的每个函数都调一遍，看它
 * 实际往 ipcRenderer 上发了什么。文本扫描抓不到的三类问题只有这里能抓：
 *   - 参数顺序写错（`invoke(ch, b, a)` 也能通过文本匹配）；
 *   - 表里有名字但对象上没有这个键（漏实现）；
 *   - on* 订阅返回的退订函数没真的摘掉监听器。
 *
 * 这也是 preload.ts 进覆盖率的前提：它是纯副作用模块，没有导出，
 * 唯一能观察的就是 contextBridge 收到了什么（见 electronMock 的 exposedMainWorld）。
 */

type ApiRecord = Record<string, unknown>

/**
 * 传给每个方法的哨兵实参。调用只看转发不看语义，值本身不重要，能认出来就行。
 * 数量必须多于最宽方法的形参个数（现在最宽是 4 个：finishTabDrag、saveNoteImage、
 * createNote），下面有断言兜住这条前提，将来出现更宽的方法会直接报出来而不是错配。
 */
const SENTINELS = ['sentinel-a', 'sentinel-b', 'sentinel-c', 'sentinel-d', 'sentinel-e', 'sentinel-f'] as const

interface IpcCall {
  kind: 'send' | 'invoke'
  channel: string
  args: unknown[]
}

let api: ApiRecord

beforeAll(async () => {
  resetElectronMock()
  await import('../../electron/preload')
  const exposed = exposedMainWorld.get('electronAPI')
  assert.ok(exposed && typeof exposed === 'object', 'preload 必须向 main world 暴露 electronAPI')
  api = exposed as ApiRecord
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
  }
  finally {
    ipcRenderer.off('send', onSend)
    ipcRenderer.off('invoke', onInvoke)
  }
  return calls
}

/** 订阅型方法：名字以 on 开头 + 首字母大写，实参是回调，返回退订函数 */
function isSubscription(method: string): boolean {
  return /^on[A-Z]/.test(method)
}

describe('preload 暴露面', () => {
  test('electronAPI 只暴露白名单能力，不含通用 IPC 通道', () => {
    // 守卫已按文本拦过一次（test:architecture 的 preload does not expose generic
    // ipcRenderer），这里从运行时对象再确认一遍：文本扫描看不到属性是怎么算出来的。
    for (const forbidden of ['ipcRenderer', 'send', 'invoke', 'on', 'off', 'require', 'process']) {
      assert.ok(!(forbidden in api), `electronAPI 不得暴露 ${forbidden}`)
    }
    // browserLayout 是唯一的非函数成员：同步读取的布局常量，不是 IPC 调用。
    assert.strictEqual(typeof api.browserLayout, 'object')
    const nonFunction = Object.keys(api).filter(key => key !== 'browserLayout' && typeof api[key] !== 'function')
    assert.deepStrictEqual(nonFunction, [], 'browserLayout 之外的成员都应是函数')
  })

  test('每个方法各自只发一条 IPC，实参按序转发', () => {
    const methods = Object.keys(api).filter(key => typeof api[key] === 'function' && !isSubscription(key))
    assert.ok(methods.length > 150, `暴露面应有 150+ 个方法，实测 ${methods.length}`)

    const seen = new Map<string, string>()
    for (const method of methods) {
      const calls = recordIpc(() => {
        void (api[method] as (...args: unknown[]) => unknown)(...SENTINELS)
      })
      assert.strictEqual(calls.length, 1, `${method} 应恰好触发一条 IPC，实测 ${calls.length} 条`)
      const [call] = calls
      assert.ok(call.channel.includes(':'), `${method} 的频道名应带命名空间前缀，实测 ${call.channel}`)

      // 哨兵数量必须够用，否则下面的前缀断言会把"参数比哨兵多"误报成"顺序不对"。
      assert.ok(
        call.args.length <= SENTINELS.length,
        `${method} 的形参比哨兵还多（${call.args.length} > ${SENTINELS.length}），请补哨兵`,
      )

      // 转发的实参必须是哨兵序列的前缀。少于哨兵数说明方法只收前几个参数，正常；
      // 顺序错位或凭空多出一个值则会在这里失败。
      assert.deepStrictEqual(
        call.args,
        SENTINELS.slice(0, call.args.length),
        `${method} 转发的实参顺序与调用不一致`,
      )

      // 同一频道被两个方法用同一种模式占着，通常是复制粘贴漏改。
      const key = `${call.kind} ${call.channel}`
      const previous = seen.get(key)
      assert.strictEqual(previous, undefined, `${method} 与 ${previous} 共用 ${key}`)
      seen.set(key, method)
    }
  })

  test('订阅型方法收得到事件，退订后不再收', () => {
    const methods = Object.keys(api).filter(key => typeof api[key] === 'function' && isSubscription(key))
    assert.ok(methods.length >= 14, `订阅型方法应有 14+ 个，实测 ${methods.length}`)

    for (const method of methods) {
      // 记全部实参而不只是第一个：有几个订阅（onProblemsUpdated、
      // onCoachDismissBubble）的回调本来就不带 payload，写死收到值会误报。
      const received: unknown[][] = []

      // 订阅用的频道名要从 ipcRenderer 的监听器表里反查——preload 没把它暴露出来。
      const before = new Set(ipcRenderer.eventNames().map(String))
      const dispose = (api[method] as (callback: (...args: unknown[]) => void) => unknown)(
        (...args) => { received.push(args) },
      )
      const added = ipcRenderer.eventNames().map(String).filter(name => !before.has(name))
      assert.strictEqual(added.length, 1, `${method} 应只注册一个频道，实测 ${added.length} 个`)
      const channel = added[0]
      assert.ok(channel.includes(':'), `${method} 的频道名应带命名空间前缀，实测 ${channel}`)
      assert.strictEqual(typeof dispose, 'function', `${method} 必须返回退订函数`)

      ipcRenderer.emit(channel, { sender: 'ipc-event' }, 'payload-1')
      assert.strictEqual(received.length, 1, `${method} 的回调应被调用一次`)
      // 传值的订阅必须把 IpcRendererEvent 剥掉，第一个实参是 payload 而不是 event。
      // 这是 preload 最容易写错的一处，文本扫描看不出来。
      if (received[0].length > 0) {
        assert.strictEqual(received[0][0], 'payload-1', `${method} 应把 payload 而非 event 传给回调`)
      }

      ;(dispose as () => void)()
      assert.strictEqual(
        ipcRenderer.listenerCount(channel),
        0,
        `${method} 退订后 ${channel} 上不应还留着监听器`,
      )
      ipcRenderer.emit(channel, { sender: 'ipc-event' }, 'payload-2')
      assert.strictEqual(received.length, 1, `${method} 退订后不应再收到事件`)
    }
  })
})
