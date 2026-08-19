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
    'services = await initializeMainServices(',
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
  const servicesIndex = mainSource.indexOf('services = await initializeMainServices(')
  const creationEnableIndex = mainSource.indexOf('windowCreationGate.enable()')
  assert.ok(persistenceIndex >= 0, 'session persistence must be installed')
  assert.ok(restoreIndex > persistenceIndex, 'restore must run after persistence and callbacks are wired')
  assert.ok(shellLoadIndex > restoreIndex, 'restore must finish before the shell renderer is loaded')
  assert.ok(creationEnableIndex > servicesIndex, 'activate must stay disabled until main services are ready')

  assert.match(mainSource, /if \(!STARTUP_SMOKE_MODE && tabSessionStore && options\.persistSession !== false\) \{[\s\S]+?new TabSessionPersistence\(/)
  assert.match(mainSource, /manager\.addSessionChangeListener\(\(\) => \{[\s\S]+?schedule\(\)/)
  assert.match(mainSource, /installWindowSessionFlush\(win, \{[\s\S]+?disposeWindowTabSessionPersistence\(windowId\)/)
  assert.match(mainSource, /windowCreationGate\.run\(createWindowOnce\)/)
  assert.match(mainSource, /windowCreationGate\.enable\(\)[\s\S]+?const initialWindow = await createWindow\(\)/)
  assert.match(mainSource, /async function createWindowOnce\([\s\S]+?await loadWindowTabSession\(\)[\s\S]+?if \(isCancelled\(\)\) return null[\s\S]+?await windowStateStore\.load[\s\S]+?if \(isCancelled\(\)\) return null/)
  assert.match(mainSource, /hasPendingWindowCreation = windowCreationGate\.isRunning[\s\S]+?windowCreationGate\.stop\(\)[\s\S]+?windowCreationGate\.waitForIdle\(\)/)
  assert.match(mainSource, /windowSessionRuntimes\.dispose\(windowId\)/)
  assert.match(mainSource, /captureResultContext:[\s\S]+?windowManager\.resolveDownloadSource\(/)
  assert.match(mainSource, /app\.on\('before-quit', \(event\) => \{[\s\S]+?event\.preventDefault\(\)[\s\S]+?disposeAllTabSessionPersistence\(\)[\s\S]+?app\.quit\(\)/)
  assert.doesNotMatch(mainSource, /\.warmup\(/)
})
