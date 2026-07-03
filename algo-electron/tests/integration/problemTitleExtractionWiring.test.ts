import assert from 'node:assert'
import fs from 'node:fs'

const mainSource = fs.readFileSync('electron/main.ts', 'utf-8')
const titleTrackingSource = fs.readFileSync('electron/tracking/problemTitleTracking.ts', 'utf-8')

assert.ok(
  mainSource.includes('installProblemTitleTracking'),
  'Main process should install problem title tracking during window setup',
)

assert.ok(
  titleTrackingSource.includes('tabManager.setTitleChangeCallback'),
  'Problem title tracking should update problem titles when the active page title changes',
)

assert.ok(
  titleTrackingSource.includes('tabManager.addActiveTabChangeListener'),
  'Problem title tracking should retry problem title extraction when switching to an already loaded tab',
)

assert.ok(
  titleTrackingSource.includes("updateProblemTitle(url, title, 'browser-title')"),
  'Active-tab title extraction should reuse the shared browser-title cleaning path',
)

assert.ok(
  titleTrackingSource.includes('scheduleTitleExtraction(url)'),
  'Active-tab title extraction should fall back to delayed DOM/title extraction when needed',
)
