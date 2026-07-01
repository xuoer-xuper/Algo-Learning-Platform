import assert from 'node:assert'
import { createScriptedRealtimeHookScript } from '../../electron/submissions/scriptedRealtimeHook.ts'

const scriptedScript = createScriptedRealtimeHookScript('pta', '({ submissions: [] })')
assert.ok(scriptedScript.includes('MutationObserver'), 'Scripted hook should keep a DOM mutation observer installed')
assert.ok(scriptedScript.includes('setInterval(report, 15000)'), 'Scripted hook should keep a low-frequency heartbeat')
assert.ok(!scriptedScript.includes('stopAt'), 'Scripted hook should not stop listening after a fixed deadline')
assert.ok(!scriptedScript.includes('observer.disconnect()'), 'Scripted hook should not disconnect its observer while the page is alive')
