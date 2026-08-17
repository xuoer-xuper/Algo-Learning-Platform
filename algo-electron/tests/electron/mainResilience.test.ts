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
