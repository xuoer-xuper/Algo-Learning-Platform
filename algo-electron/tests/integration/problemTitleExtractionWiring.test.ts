import assert from 'node:assert'
import fs from 'node:fs'

const mainSource = fs.readFileSync('electron/main.ts', 'utf-8')

assert.ok(
  mainSource.includes('tabManager.setTitleChangeCallback'),
  'Main process should update problem titles when the active page title changes',
)

assert.ok(
  mainSource.includes('tabManager.addActiveTabChangeListener'),
  'Main process should retry problem title extraction when switching to an already loaded tab',
)

assert.ok(
  mainSource.includes("updateProblemTitle(url, title, 'browser-title')"),
  'Active-tab title extraction should reuse the shared browser-title cleaning path',
)

assert.ok(
  mainSource.includes('scheduleTitleExtraction(url)'),
  'Active-tab title extraction should fall back to delayed DOM/title extraction when needed',
)
