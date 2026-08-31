import { test } from 'vitest'
import assert from 'node:assert'
import {
  createOjSubmissionBridge,
  installOjSubmissionMessageForwarder,
  OJ_SUBMISSION_BRIDGE_CHANNEL,
} from '../../electron/browser/ojBridge.ts'

test('browser/ojBridge.test.ts', async () => {

const directReports: unknown[] = []
const bridge = createOjSubmissionBridge((payload) => directReports.push(payload))
bridge.reportSubmission({ id: 1 })
assert.deepStrictEqual(directReports, [{ id: 1 }], 'OJ bridge should expose reportSubmission')

/*
 * 收进数组而不是 `let handler … | null`。
 *
 * 后者过不了类型检查，而且失败方式很反直觉：赋值发生在 `addEventListener` 的闭包里，
 * TS 的控制流分析看不见，于是认定 `assert(messageHandler)` 之前它仍是 `null`，
 * 断言一交就收窄成 `never`——调用点报的是"This expression is not callable"，
 * 跟"可能为 null"完全不像。数组下标没有这个问题。
 */
const messageHandlers: Array<(event: MessageEvent) => void> = []
const forwardedReports: unknown[] = []
const nestedFrame = { postMessage() {}, frames: { length: 0 } }
const childFrame = { postMessage() {} }
;(childFrame as any).frames = {
  length: 1,
  0: nestedFrame,
}
const fakeWindow = {
  frames: {
    length: 1,
    0: childFrame,
  },
  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    if (type === 'message') messageHandlers.push(handler)
  },
} as Pick<Window, 'addEventListener'>

installOjSubmissionMessageForwarder(fakeWindow, (payload) => forwardedReports.push(payload))
assert.strictEqual(messageHandlers.length, 1, 'OJ bridge should register a message listener')
const [dispatch] = messageHandlers

/**
 * 只造测试关心的三个字段。原先每处写 `{ … } as MessageEvent`，而 `MessageEvent` 有十几个
 * 成员，这种缺字段的断言 TS 会拒（TS2352：两个类型重叠不足）——不是挑剔，`as` 本来就该用于
 * "我比编译器知道得多"，而不是"这里少了十个字段但没关系"。收成一个辅助函数后，
 * 缺字段这件事只在一个地方声明一次。
 */
const postBridgeMessage = (source: unknown, channel: string, payload: unknown): void => {
  dispatch({ source, data: { channel, payload } } as unknown as MessageEvent)
}

postBridgeMessage(fakeWindow, OJ_SUBMISSION_BRIDGE_CHANNEL, { submissionId: '123456' })

assert.deepStrictEqual(
  forwardedReports,
  [{ submissionId: '123456' }],
  'OJ bridge should forward same-window bridge messages',
)

postBridgeMessage(childFrame, OJ_SUBMISSION_BRIDGE_CHANNEL, { submissionId: 'from-child-frame' })

assert.deepStrictEqual(
  forwardedReports,
  [{ submissionId: '123456' }, { submissionId: 'from-child-frame' }],
  'OJ bridge should forward same-page child frame messages',
)

postBridgeMessage(nestedFrame, OJ_SUBMISSION_BRIDGE_CHANNEL, { submissionId: 'from-nested-frame' })

assert.deepStrictEqual(
  forwardedReports,
  [{ submissionId: '123456' }, { submissionId: 'from-child-frame' }, { submissionId: 'from-nested-frame' }],
  'OJ bridge should forward nested same-page frame messages',
)

// 外部窗口（不在本页 frame 树里）与无关 channel 都不该被转发
postBridgeMessage({ postMessage() {} }, OJ_SUBMISSION_BRIDGE_CHANNEL, { submissionId: 'spoofed' })
postBridgeMessage(fakeWindow, 'other-channel', { submissionId: 'ignored' })

assert.deepStrictEqual(
  forwardedReports,
  [{ submissionId: '123456' }, { submissionId: 'from-child-frame' }, { submissionId: 'from-nested-frame' }],
  'OJ bridge should ignore external windows and unrelated message channels',
)

})
