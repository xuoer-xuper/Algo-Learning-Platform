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
    'new ApplicationSessionStore(',
  ]
  for (const call of protectedCalls) {
    assert.ok(gatedSource.includes(call), `${call} must stay behind the single-instance gate`)
    assert.strictEqual(mainSource.slice(0, gateIndex).includes(call), false, `${call} must not run before the gate`)
  }
})

test('main process restores and flushes browser sessions without affecting startup smoke', () => {
  const storeIndex = mainSource.indexOf('new ApplicationSessionStore(')
  const loadIndex = mainSource.indexOf('await loadStartupApplicationSession()')
  const persistenceIndex = mainSource.indexOf('new ApplicationSessionPersistence(')
  const restoreIndex = mainSource.indexOf('tabManager.restoreSession({')
  const shellLoadIndex = mainSource.indexOf('win.loadURL(')
  const servicesIndex = mainSource.indexOf('services = await initializeMainServices(')
  const creationEnableIndex = mainSource.indexOf('windowCreationGate.enable()')
  assert.ok(storeIndex > servicesIndex, 'application session store must initialize after main services')
  assert.ok(loadIndex > storeIndex, 'the full application snapshot must load before window creation starts')
  assert.ok(creationEnableIndex > loadIndex, 'window creation must stay gated until the snapshot is loaded')
  assert.ok(persistenceIndex >= 0, 'session persistence must be installed')
  assert.ok(shellLoadIndex > restoreIndex, 'restore must finish before the shell renderer is loaded')
  assert.ok(persistenceIndex > creationEnableIndex, 'global persistence starts after restored windows exist')

  assert.match(mainSource, /if \(!STARTUP_SMOKE_MODE\) \{[\s\S]+?new ApplicationSessionStore\([\s\S]+?await loadStartupApplicationSession\(\)/)
  assert.match(mainSource, /tabManager\.addSessionChangeListener\(scheduleApplicationSession\)/)
  assert.match(mainSource, /win\.on\('move', scheduleApplicationSession\)[\s\S]+?win\.on\('resize', scheduleApplicationSession\)/)
  assert.match(mainSource, /installWindowSessionFlush\(win, \{[\s\S]+?applicationSessionPersistence\?\.flush\(\)/)
  assert.match(mainSource, /windowCreationGate\.run\(\(isCancelled\) => createWindowOnce\(isCancelled, options\)\)/)
  assert.match(mainSource, /windowCreationGate\.enable\(\)[\s\S]+?for \(const snapshot of restorableWindows\)[\s\S]+?restoreSnapshot: snapshot/)
  assert.match(mainSource, /createApplicationSessionSnapshot\([\s\S]+?windowManager\.getMostRecent\(\)\?\.id/)
  assert.match(mainSource, /if \(tabSession\.tabs\.length === 0\) return \[\]/)
  assert.match(mainSource, /new ApplicationSessionPersistence\([\s\S]+?getCurrentApplicationSessionSnapshot/)
  assert.match(mainSource, /windowManager\.addMostRecentWindowChangeListener\(\(\) => \{[\s\S]+?scheduleApplicationSession\(\)/)
  assert.match(mainSource, /hasPendingWindowCreation = windowCreationGate\.isRunning[\s\S]+?windowCreationGate\.stop\(\)[\s\S]+?windowCreationGate\.waitForIdle\(\)/)
  assert.match(mainSource, /captureResultContext:[\s\S]+?windowManager\.resolveDownloadSource\(/)
  assert.match(mainSource, /app\.on\('before-quit', \(event\) => \{[\s\S]+?event\.preventDefault\(\)[\s\S]+?applicationSessionPersistence\?\.dispose\(\)[\s\S]+?app\.quit\(\)/)
  assert.doesNotMatch(mainSource, /new TabSessionPersistence\(/)
  assert.doesNotMatch(mainSource, /windowSessionRuntimes/)
  assert.doesNotMatch(mainSource, /\.warmup\(/)
})

test('the final complete shell closes the pet and exits the application', () => {
  assert.match(mainSource, /function quitIfLastShellWindowClosed\(\): void \{[\s\S]+?windowManager\.getAll\(\)\.length > 0[\s\S]+?coachPetWindow\?\.destroy\(\)[\s\S]+?app\.quit\(\)/)
  assert.match(mainSource, /win\.on\('closed', \(\) => \{[\s\S]+?tabManager\.destroy\(\)[\s\S]+?quitIfLastShellWindowClosed\(\)/)
})
