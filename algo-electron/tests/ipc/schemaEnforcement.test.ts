import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'vitest'
import { z } from 'zod'
import {
  MockWebContents,
  ipcMain as mockIpcMain,
  resetElectronMock,
} from '../electron/electronMock'
import {
  handleFromShell,
  onFromShell,
  registerShellWebContents,
  resetTrustedSenderRegistry,
} from '../../electron/ipc/trustedSender.ts'
import { IPC_CHANNELS, type IpcChannel } from '../../src/shared/constants/channels'

/**
 * schema 是否真的挂在了注册路径上。
 *
 * `ipcSchemas.test.ts` 验的是 schema 本身；这里验的是接线——声明了 schema 的 channel
 * 在收到非法实参时**不会进 handler**，而未声明 schema 的 channel 行为和以前一样。
 * 少了这一层，schema 写得再对也可能压根没被调用。
 *
 * channel 一律取 `IPC_CHANNELS` 的真实成员：注册函数的 `channel` 参数已收窄为
 * `IpcChannel` 闭集，本文件原先的 `'test:*'` 合成名进不了类型。每个用例注册前
 * `beforeEach` 都会重置 mock，真实 channel 名不会跨用例串线。
 */

/** 造一个已登记的壳 sender：origin 与 frame 都得对，否则会先被 sender 校验拦掉。 */
function shellEvent(): { event: never; contents: MockWebContents } {
  const contents = new MockWebContents()
  // loadURL 同时设 url 与 mainFrame.url，两者必须一致——`isExpectedOrigin` 比的就是这两个。
  void contents.loadURL('app://shell/index.html')
  registerShellWebContents(contents as never)
  return { event: { sender: contents, senderFrame: contents.mainFrame } as never, contents }
}

beforeEach(() => {
  resetElectronMock()
  resetTrustedSenderRegistry()
})

describe('handle 侧', () => {
  test('合法实参被收窄后交给 handler', async () => {
    const seen: unknown[] = []
    handleFromShell(
      IPC_CHANNELS.STATS.GET_OVERVIEW,
      [z.string(), z.number().int().min(1).max(10).optional()],
      (_event, id, count) => {
        /*
         * 逐位类型在这里被真正用掉，而不是只在注释里声称。
         *
         * 这两个局部声明就是断言本身：schema 元组是**异构**的，如果注册函数的类型参数
         * 丢了 `const` 修饰符，`ZodParsedArgs` 的每一位都会塌成 `string | number | undefined`，
         * 下面两行当场 tsc 不过。而 `seen.push([id, count])` 那种写法验不到这件事——
         * 推进 `unknown[]` 和拼进模板串都不区分位置。
         */
        const narrowedId: string = id
        const narrowedCount: number | undefined = count
        seen.push([narrowedId, narrowedCount])
        return `${narrowedId}:${narrowedCount ?? 0}`
      },
    )
    const { event } = shellEvent()
    assert.strictEqual(
      await mockIpcMain.invokeHandler(IPC_CHANNELS.STATS.GET_OVERVIEW, event, 'problem-1', 3),
      'problem-1:3',
    )
    assert.strictEqual(
      await mockIpcMain.invokeHandler(IPC_CHANNELS.STATS.GET_OVERVIEW, event, 'problem-1'),
      'problem-1:0',
    )
    assert.deepStrictEqual(seen, [
      ['problem-1', 3],
      ['problem-1', undefined],
    ])
  })

  test('非法实参被拒绝，handler 一次都没进', async () => {
    let calls = 0
    handleFromShell(IPC_CHANNELS.STATS.RECOMPUTE_DAILY, [z.number().int().min(1).max(10)], () => {
      calls += 1
    })
    const { event } = shellEvent()
    for (const bad of ['3', 0, 11, 1.5, null, {}, undefined]) {
      await assert.rejects(
        () => mockIpcMain.invokeHandler(IPC_CHANNELS.STATS.RECOMPUTE_DAILY, event, bad),
        /Rejected IPC sender \(payload\)/,
        `${JSON.stringify(bad) ?? 'undefined'} 应被拒绝`,
      )
    }
    assert.strictEqual(calls, 0, 'handler 不应被调用')
  })

  test('handler 自己抛的业务异常原样抛出，不被改写成载荷拒绝', async () => {
    // 区分这两类失败很重要：载荷拒绝说明调用方传错了，业务异常说明主进程里出了别的问题。
    // 把后者也写成 "Rejected IPC sender" 会让排查方向整个偏掉。
    handleFromShell(IPC_CHANNELS.STATS.GET_STREAK_DAYS, [z.string()], () => {
      throw new Error('database is locked')
    })
    const { event } = shellEvent()
    await assert.rejects(
      () => mockIpcMain.invokeHandler(IPC_CHANNELS.STATS.GET_STREAK_DAYS, event, 'x'),
      /database is locked/,
    )
  })

  test('未声明 schema 的 channel 行为不变', async () => {
    // 迁移期两种形态共存，旧形态不能受影响。
    handleFromShell(IPC_CHANNELS.STATS.GET_LAST_ACTIVE_TIME, (_event, ...args) => args)
    const { event } = shellEvent()
    assert.deepStrictEqual(
      await mockIpcMain.invokeHandler(
        IPC_CHANNELS.STATS.GET_LAST_ACTIVE_TIME,
        event,
        'anything',
        42,
        { nested: true },
      ),
      ['anything', 42, { nested: true }],
    )
  })
})

describe('on 侧', () => {
  test('合法实参进 handler，非法实参被丢弃且不抛', () => {
    // send 没有返回通道：校验失败只能记日志后丢弃。抛出去会变成主进程里一条没人接的异常。
    const seen: unknown[] = []
    onFromShell(IPC_CHANNELS.BROWSER.SET_SIDEBAR_WIDTH, [z.string()], (_event, id) => {
      seen.push(id)
    })
    const { event } = shellEvent()
    mockIpcMain.emit(IPC_CHANNELS.BROWSER.SET_SIDEBAR_WIDTH, event, 'good-id')
    assert.doesNotThrow(() => mockIpcMain.emit(IPC_CHANNELS.BROWSER.SET_SIDEBAR_WIDTH, event, 42))
    assert.doesNotThrow(() => mockIpcMain.emit(IPC_CHANNELS.BROWSER.SET_SIDEBAR_WIDTH, event))
    assert.deepStrictEqual(seen, ['good-id'], '只有合法的那次应进 handler')
  })
})

describe('注册形态', () => {
  test('给了 schema 却没给 listener 时当场报错', () => {
    // 这是写错代码，不是运行时输入问题，所以在注册期就要炸——注册期的错误在启动时就能发现，
    // 而不是等到某个 channel 第一次被调用。
    assert.throws(
      () =>
        (handleFromShell as (channel: IpcChannel, schemas: unknown) => void)(
          IPC_CHANNELS.STATS.GET_TIMELINE,
          [z.string()],
        ),
      /requires a listener/,
    )
  })
})
