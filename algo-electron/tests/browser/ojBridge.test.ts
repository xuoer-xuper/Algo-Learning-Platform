import assert from 'node:assert'
import {
  createOjSubmissionBridge,
  installOjSubmissionMessageForwarder,
  OJ_SUBMISSION_BRIDGE_CHANNEL,
} from '../../electron/browser/ojBridge.ts'

const directReports: unknown[] = []
const bridge = createOjSubmissionBridge((payload) => directReports.push(payload))
bridge.reportSubmission({ id: 1 })
assert.deepStrictEqual(directReports, [{ id: 1 }], 'OJ bridge should expose reportSubmission')

let messageHandler: ((event: MessageEvent) => void) | null = null
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
    if (type === 'message') messageHandler = handler
  },
} as Pick<Window, 'addEventListener'>

installOjSubmissionMessageForwarder(fakeWindow, (payload) => forwardedReports.push(payload))
assert(messageHandler, 'OJ bridge should register a message listener')

messageHandler({
  source: fakeWindow,
  data: {
    channel: OJ_SUBMISSION_BRIDGE_CHANNEL,
    payload: { submissionId: '123456' },
  },
} as MessageEvent)

assert.deepStrictEqual(
  forwardedReports,
  [{ submissionId: '123456' }],
  'OJ bridge should forward same-window bridge messages',
)

messageHandler({
  source: childFrame,
  data: {
    channel: OJ_SUBMISSION_BRIDGE_CHANNEL,
    payload: { submissionId: 'from-child-frame' },
  },
} as MessageEvent)

assert.deepStrictEqual(
  forwardedReports,
  [{ submissionId: '123456' }, { submissionId: 'from-child-frame' }],
  'OJ bridge should forward same-page child frame messages',
)

messageHandler({
  source: nestedFrame,
  data: {
    channel: OJ_SUBMISSION_BRIDGE_CHANNEL,
    payload: { submissionId: 'from-nested-frame' },
  },
} as MessageEvent)

assert.deepStrictEqual(
  forwardedReports,
  [{ submissionId: '123456' }, { submissionId: 'from-child-frame' }, { submissionId: 'from-nested-frame' }],
  'OJ bridge should forward nested same-page frame messages',
)

messageHandler({
  source: { postMessage() {} },
  data: {
    channel: OJ_SUBMISSION_BRIDGE_CHANNEL,
    payload: { submissionId: 'spoofed' },
  },
} as MessageEvent)

messageHandler({
  source: fakeWindow,
  data: {
    channel: 'other-channel',
    payload: { submissionId: 'ignored' },
  },
} as MessageEvent)

assert.deepStrictEqual(
  forwardedReports,
  [{ submissionId: '123456' }, { submissionId: 'from-child-frame' }, { submissionId: 'from-nested-frame' }],
  'OJ bridge should ignore external windows and unrelated message channels',
)
