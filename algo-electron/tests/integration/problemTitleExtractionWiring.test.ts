import { test } from 'vitest'
import assert from 'node:assert'
import fs from 'node:fs'

test('integration/problemTitleExtractionWiring.test.ts', async () => {

const mainSource = fs.readFileSync('electron/main.ts', 'utf-8')
const titleTrackingSource = fs.readFileSync('electron/tracking/problemTitleTracking.ts', 'utf-8')

assert.ok(
  mainSource.includes('installProblemTitleTracking'),
  'Main process should install problem title tracking during window setup',
)

assert.ok(
  titleTrackingSource.includes('tabManager.addPageEventListener'),
  'Problem title tracking should consume exact per-page lifecycle events',
)

assert.ok(
  titleTrackingSource.includes("event.reason === 'page-title-updated'"),
  'Problem title tracking should update problem titles from exact page title events',
)

assert.ok(
  titleTrackingSource.includes('tabManager.executeScriptForPage(event, script)'),
  'Problem title fallback should execute against the exact page owner',
)

assert.ok(
  titleTrackingSource.includes('scheduleTitleExtraction(event)'),
  'Active-tab title extraction should fall back to delayed DOM/title extraction when needed',
)

})
