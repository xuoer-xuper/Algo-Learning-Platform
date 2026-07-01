import assert from 'node:assert'
import { RealtimeSubmissionDiagnostics } from '../../electron/submissions/RealtimeSubmissionDiagnostics.ts'

const diagnostics = new RealtimeSubmissionDiagnostics()

assert.strictEqual(diagnostics.getStatus().ipcRegistered, false, 'Diagnostics should start with IPC marked unregistered')
assert.deepStrictEqual(diagnostics.getStatus().supportedAdapterIds, [], 'Diagnostics should start with no supported adapter ids')

diagnostics.setIpcRegistered(true)
diagnostics.setSupportedAdapterIds(['codeforces', 'leetcode-cn'])
diagnostics.recordPageSeen('https://leetcode.cn/problems/two-sum/', 'leetcode-cn')
diagnostics.recordHookSuccess('leetcode-cn', 'https://leetcode.cn/problems/two-sum/')
let status = diagnostics.getStatus()

assert.strictEqual(status.ipcRegistered, true, 'Diagnostics should report registered IPC state')
assert.deepStrictEqual(status.supportedAdapterIds, ['codeforces', 'leetcode-cn'], 'Diagnostics should expose realtime supported adapter ids')
assert.strictEqual(status.lastPage?.url, 'https://leetcode.cn/problems/two-sum/', 'Diagnostics should record the last observed page')
assert.strictEqual(status.lastPage?.realtimeAdapterId, 'leetcode-cn', 'Diagnostics should record realtime adapter for supported pages')
assert.strictEqual(status.lastPage?.realtimeSupported, true, 'Diagnostics should mark supported realtime pages')
assert.strictEqual(status.lastHook?.adapterId, 'leetcode-cn', 'Diagnostics should record hook adapter id')
assert.strictEqual(status.lastHook?.status, 'success', 'Diagnostics should record successful hook injection')
assert.strictEqual(status.lastHook?.url, 'https://leetcode.cn/problems/two-sum/', 'Diagnostics should record hook URL')
assert.ok(status.lastHook?.at, 'Diagnostics should timestamp hook injection')

diagnostics.recordDetection('https://leetcode.cn/problems/two-sum/', {
  inserted: true,
  notification: {
    platform: 'leetcode-cn',
    verdict: 'AC',
    problemId: 'leetcode-cn:two-sum',
  },
})
status = diagnostics.getStatus()

assert.strictEqual(status.lastDetection?.senderUrl, 'https://leetcode.cn/problems/two-sum/', 'Diagnostics should record detection sender URL')
assert.strictEqual(status.lastDetection?.inserted, true, 'Diagnostics should record detection insert result')
assert.strictEqual(status.lastDetection?.platform, 'leetcode-cn', 'Diagnostics should record detected submission platform')
assert.strictEqual(status.lastDetection?.verdict, 'AC', 'Diagnostics should record detected submission verdict')
assert.strictEqual(status.lastDetection?.problemId, 'leetcode-cn:two-sum', 'Diagnostics should record detected submission problem id')
assert.ok(status.lastDetection?.at, 'Diagnostics should timestamp detection result')

diagnostics.recordHookFailure('leetcode-cn', 'https://leetcode.cn/problems/two-sum/', new Error('execute failed'))
status = diagnostics.getStatus()

assert.strictEqual(status.lastHook?.status, 'failed', 'Diagnostics should record hook injection failure')
assert.strictEqual(status.lastHook?.error, 'execute failed', 'Diagnostics should record hook error message')

diagnostics.recordHookSkipped('leetcode-cn', 'https://leetcode.cn/problems/two-sum/', 'Site disabled')
status = diagnostics.getStatus()

assert.strictEqual(status.lastHook?.status, 'skipped', 'Diagnostics should record skipped hook injection')
assert.strictEqual(status.lastHook?.reason, 'Site disabled', 'Diagnostics should record skipped hook reason')

diagnostics.recordPageSeen('https://example.com/')
status = diagnostics.getStatus()

assert.strictEqual(status.lastPage?.url, 'https://example.com/', 'Diagnostics should update last observed page')
assert.strictEqual(status.lastPage?.realtimeAdapterId, undefined, 'Diagnostics should omit adapter for unsupported pages')
assert.strictEqual(status.lastPage?.realtimeSupported, false, 'Diagnostics should mark unsupported realtime pages')

diagnostics.setIpcRegistered(false)
assert.strictEqual(diagnostics.getStatus().ipcRegistered, false, 'Diagnostics should report unregistered IPC state after disposal')
