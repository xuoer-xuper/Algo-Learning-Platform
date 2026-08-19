import fs from 'node:fs'
import { expect, test } from 'vitest'

test('Coach constraint extraction follows exact active page events', () => {
  const source = fs.readFileSync('electron/coach/CoachOrchestrator.ts', 'utf8')

  expect(source).toContain('tabManager.addPageEventListener')
  expect(source).toContain("event.reason !== 'did-navigate-in-page'")
  expect(source).toContain('tabManager.isPageActive(pageEvent)')
  expect(source).toContain('tabManager.executeScriptForPage(pageEvent, code)')
  expect(source).not.toContain('tabManager.executeScriptOnUrl(targetUrl, code)')
})
