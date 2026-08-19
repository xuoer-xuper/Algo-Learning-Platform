import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import {
  UserScriptHostPermissionBroker,
  type UserScriptHostPermissionPrompt,
  type UserScriptHostPermissionRequest,
} from '../../electron/scripts/UserScriptHostPermissionBroker'

afterEach(() => {
  vi.useRealTimers()
})

test('queues per window, merges the same script and exact host, and exposes only safe prompt fields', async () => {
  const harness = createHarness()
  const first = harness.broker.request(request())
  const merged = harness.broker.request({
    ...request(),
    scriptName: 'Changed',
    targetHost: 'API.EXAMPLE.COM',
    sourceHost: 'frame.example.com',
  })
  const queued = harness.broker.request(request({ scriptId: 'script-2', targetHost: 'cdn.example.com' }))
  const otherWindow = harness.broker.request(request({ windowId: 'window-2', scriptId: 'script-3' }))

  assert.strictEqual(first, merged)
  assert.strictEqual(harness.sent.length, 2)
  assert.deepStrictEqual(Object.keys(harness.sent[0].prompt).sort(), [
    'promptId', 'scriptName', 'sourceHost', 'targetHost',
  ])
  assert.deepStrictEqual(harness.sent.map(entry => entry.windowId), ['window-1', 'window-2'])
  assert.deepStrictEqual(harness.shown, ['window-1', 'window-2'])

  const current = harness.broker.getCurrent('window-1')
  assert.deepStrictEqual(current, harness.sent[0].prompt)
  assert.notStrictEqual(current, harness.sent[0].prompt)
  assert.strictEqual(await harness.broker.respond('window-1', current!.promptId, false), 'denied')
  assert.strictEqual(await first, false)
  assert.strictEqual(await merged, false)
  assert.strictEqual(harness.sent.length, 3)

  harness.broker.cancelWindow('window-1')
  harness.broker.cancelWindow('window-2')
  assert.strictEqual(await queued, false)
  assert.strictEqual(await otherWindow, false)
})

test('requires the exact window and prompt id before accepting a response', async () => {
  const harness = createHarness()
  const result = harness.broker.request(request())
  const prompt = harness.broker.getCurrent('window-1')!

  assert.strictEqual(await harness.broker.respond('window-2', prompt.promptId, true), 'stale')
  assert.strictEqual(await harness.broker.respond('window-1', 'wrong-prompt', true), 'stale')
  assert.deepStrictEqual(harness.grants, [])
  assert.deepStrictEqual(harness.broker.getCurrent('window-1'), prompt)

  assert.strictEqual(await harness.broker.respond('window-1', prompt.promptId, true), 'allowed')
  assert.strictEqual(await result, true)
  assert.deepStrictEqual(harness.grants, [['script-1', 'api.example.com']])
})

test('fails closed when persisting an allowed host fails', async () => {
  const harness = createHarness({ grantError: new Error('database unavailable') })
  const result = harness.broker.request(request())
  const prompt = harness.broker.getCurrent('window-1')!

  assert.strictEqual(await harness.broker.respond('window-1', prompt.promptId, true), 'persist-failed')
  assert.strictEqual(await result, false)
  assert.strictEqual(harness.broker.getCurrent('window-1'), null)
  assert.deepStrictEqual(harness.hidden, ['window-1'])
})

test('does not persist when validation fails or the generation is cancelled during validation', async () => {
  let releaseValidation: ((valid: boolean) => void) | null = null
  const validation = new Promise<boolean>((resolve) => { releaseValidation = resolve })
  const harness = createHarness({ validate: () => validation })
  const result = harness.broker.request(request())
  const prompt = harness.broker.getCurrent('window-1')!
  const response = harness.broker.respond('window-1', prompt.promptId, true)

  harness.broker.cancelGeneration(7)
  releaseValidation!(true)

  assert.strictEqual(await response, 'stale')
  assert.strictEqual(await result, false)
  assert.deepStrictEqual(harness.grants, [])

  const rejected = createHarness({ validate: () => false })
  const rejectedResult = rejected.broker.request(request())
  const rejectedPrompt = rejected.broker.getCurrent('window-1')!
  assert.strictEqual(await rejected.broker.respond('window-1', rejectedPrompt.promptId, true), 'stale')
  assert.strictEqual(await rejectedResult, false)
  assert.deepStrictEqual(rejected.grants, [])
})

test('negative-caches denials for the same generation and clears them on generation cancellation', async () => {
  const harness = createHarness()
  const first = harness.broker.request(request())
  const prompt = harness.broker.getCurrent('window-1')!
  await harness.broker.respond('window-1', prompt.promptId, false)
  assert.strictEqual(await first, false)

  assert.strictEqual(await harness.broker.request(request({ windowId: 'window-2' })), false)
  assert.strictEqual(harness.sent.length, 1)

  const nextGeneration = harness.broker.request(request({ generation: 8, windowId: 'window-2' }))
  assert.strictEqual(harness.sent.length, 2)
  harness.broker.cancelGeneration(8)
  assert.strictEqual(await nextGeneration, false)

  harness.broker.cancelGeneration(7)
  const retried = harness.broker.request(request({ windowId: 'window-2' }))
  assert.strictEqual(harness.sent.length, 3)
  harness.broker.cancelWindow('window-2')
  assert.strictEqual(await retried, false)
})

test('settles matching requests in other windows after one persisted decision', async () => {
  const harness = createHarness()
  const first = harness.broker.request(request())
  const second = harness.broker.request(request({ windowId: 'window-2' }))
  const prompt = harness.broker.getCurrent('window-1')!

  assert.strictEqual(await harness.broker.respond('window-1', prompt.promptId, true), 'allowed')
  assert.strictEqual(await first, true)
  assert.strictEqual(await second, true)
  assert.deepStrictEqual(harness.hidden.sort(), ['window-1', 'window-2'])
  assert.strictEqual(harness.broker.getCurrent('window-2'), null)
})

test('times out fail closed and suppresses repeated prompts in the same generation', async () => {
  vi.useFakeTimers()
  const harness = createHarness({ timeoutMs: 25 })
  const result = harness.broker.request(request())

  await vi.advanceTimersByTimeAsync(25)
  assert.strictEqual(await result, false)
  assert.strictEqual(harness.broker.getCurrent('window-1'), null)
  assert.deepStrictEqual(harness.hidden, ['window-1'])
  assert.strictEqual(await harness.broker.request(request()), false)
  assert.strictEqual(harness.sent.length, 1)
})

test('cancelWindow and dispose resolve queued work and prevent later prompts', async () => {
  const harness = createHarness()
  const first = harness.broker.request(request())
  const queued = harness.broker.request(request({ scriptId: 'script-2', targetHost: 'cdn.example.com' }))
  harness.broker.cancelWindow('window-1')
  assert.strictEqual(await first, false)
  assert.strictEqual(await queued, false)
  assert.strictEqual(harness.broker.getCurrent('window-1'), null)

  const beforeDispose = harness.broker.request(request({ windowId: 'window-2' }))
  harness.broker.dispose()
  assert.strictEqual(await beforeDispose, false)
  assert.strictEqual(await harness.broker.request(request({ windowId: 'window-3' })), false)
})

test('rejects unbounded or non-canonical display input without showing a prompt', async () => {
  const harness = createHarness()
  const invalid = [
    request({ scriptName: `Script\nName` }),
    request({ targetHost: 'https://api.example.com' }),
    request({ targetHost: 'api.example.com/path' }),
    request({ targetHost: 'api_example.com' }),
    request({ targetHost: 'com' }),
    request({ sourceHost: 'source.example.com\u202e' }),
    request({ windowId: `window ${'x'.repeat(260)}` }),
    request({ generation: -1 }),
  ]
  for (const input of invalid) assert.strictEqual(await harness.broker.request(input), false)
  assert.deepStrictEqual(harness.sent, [])
  assert.deepStrictEqual(harness.shown, [])
})

function request(overrides: Partial<UserScriptHostPermissionRequest> = {}): UserScriptHostPermissionRequest {
  return {
    windowId: 'window-1',
    generation: 7,
    scriptId: 'script-1',
    scriptName: 'Network Helper',
    targetHost: 'api.example.com',
    sourceHost: 'example.com',
    ...overrides,
  }
}

function createHarness(options: {
  timeoutMs?: number
  grantError?: Error
  validate?: () => boolean | Promise<boolean>
} = {}) {
  const sent: Array<{ windowId: string; prompt: UserScriptHostPermissionPrompt }> = []
  const shown: string[] = []
  const hidden: string[] = []
  const grants: Array<[string, string]> = []
  const broker = new UserScriptHostPermissionBroker({
    timeoutMs: options.timeoutMs,
    grantUserScriptHost: (scriptId, host) => {
      grants.push([scriptId, host])
      if (options.grantError) throw options.grantError
    },
    send: (windowId, prompt) => { sent.push({ windowId, prompt: { ...prompt } }) },
    show: windowId => { shown.push(windowId) },
    hide: windowId => { hidden.push(windowId) },
    validate: options.validate,
  })
  return { broker, sent, shown, hidden, grants }
}
