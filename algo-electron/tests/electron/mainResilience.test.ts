import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'vitest'

const mainSource = fs.readFileSync('electron/main.ts', 'utf8')

test('main process keeps fatal error and shell renderer recovery wiring', () => {
  assert.match(mainSource, /installMainProcessErrorHandlers\(process, reportFatalError\)/)
  assert.match(mainSource, /app\.whenReady\(\)\.then\([\s\S]+?\)\.catch\(\(error\) => \{/)
  assert.match(mainSource, /reportFatalError\('startup', error\)/)
  assert.match(mainSource, /installShellRendererRecovery\(win\.webContents/)
  assert.match(mainSource, /shouldReload: \(\) => !isQuitting/)
})

test('main process gates protocols, IPC, lifecycle, and services behind the single-instance lock', () => {
  const lockIndex = mainSource.indexOf('const hasSingleInstanceLock = installSingleInstanceLock')
  const gateIndex = mainSource.indexOf('if (hasSingleInstanceLock)')
  assert.ok(lockIndex >= 0, 'single-instance lock must be requested')
  assert.ok(gateIndex > lockIndex, 'startup registrations must be gated after the lock request')

  const gatedSource = mainSource.slice(gateIndex)
  const protectedCalls = [
    "initializeAppLogger(path.join(app.getPath('userData'), 'logs'))",
    'registerNoteAssetSchemeAsPrivileged()',
    'registerShellSchemeAsPrivileged()',
    'registerMainIpc({',
    "app.on('window-all-closed'",
    'void app.whenReady().then(',
    'initializeMainServices(() => win)',
  ]
  for (const call of protectedCalls) {
    assert.ok(gatedSource.includes(call), `${call} must stay behind the single-instance gate`)
    assert.strictEqual(mainSource.slice(0, gateIndex).includes(call), false, `${call} must not run before the gate`)
  }
})
