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
    'new TabSessionStore(',
  ]
  for (const call of protectedCalls) {
    assert.ok(gatedSource.includes(call), `${call} must stay behind the single-instance gate`)
    assert.strictEqual(mainSource.slice(0, gateIndex).includes(call), false, `${call} must not run before the gate`)
  }
})

test('main process restores and flushes browser sessions without affecting startup smoke', () => {
  const persistenceIndex = mainSource.indexOf('new TabSessionPersistence(')
  const restoreIndex = mainSource.indexOf('manager.restoreSession(loadedSession.snapshot)')
  const shellLoadIndex = mainSource.indexOf('win.loadURL(')
  assert.ok(persistenceIndex >= 0, 'session persistence must be installed')
  assert.ok(restoreIndex > persistenceIndex, 'restore must run after persistence and callbacks are wired')
  assert.ok(shellLoadIndex > restoreIndex, 'restore must finish before the shell renderer is loaded')

  assert.match(mainSource, /if \(!STARTUP_SMOKE_MODE && tabSessionStore\) \{[\s\S]+?new TabSessionPersistence\(/)
  assert.match(mainSource, /manager\.addSessionChangeListener\(\(\) => \{[\s\S]+?schedule\(\)/)
  assert.match(mainSource, /installWindowSessionFlush\(win, \{[\s\S]+?flush: disposeTabSessionPersistence/)
  assert.match(mainSource, /app\.on\('before-quit', \(event\) => \{[\s\S]+?event\.preventDefault\(\)[\s\S]+?disposeTabSessionPersistence\(\)[\s\S]+?app\.quit\(\)/)
  assert.doesNotMatch(mainSource, /\.warmup\(/)
})
