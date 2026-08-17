import assert from 'node:assert/strict'
import { test } from 'vitest'
import { session, type MockSession, resetElectronMock } from 'electron'
import { configureOjSession } from '../../electron/browser/ojSession.ts'
import { isBrowserPermissionAllowed } from '../../electron/browser/permissionPolicy.ts'

test('permission policy denies sensitive browser capabilities by default', () => {
  assert.strictEqual(isBrowserPermissionAllowed('media'), false)
  assert.strictEqual(isBrowserPermissionAllowed('geolocation'), false)
  assert.strictEqual(isBrowserPermissionAllowed('notifications'), false)
  assert.strictEqual(isBrowserPermissionAllowed('openExternal'), false)
  assert.strictEqual(isBrowserPermissionAllowed('fullscreen'), true)
  assert.strictEqual(isBrowserPermissionAllowed('clipboard-sanitized-write'), true)
})

test('default and OJ sessions install permission request and check handlers', () => {
  resetElectronMock()
  configureOjSession({ getSiteById: () => null })

  const defaultSession = session.defaultSession as MockSession
  const ojSession = session.fromPartition('persist:oj-main') as MockSession
  assert.ok(defaultSession.permissionCheckHandler)
  assert.ok(defaultSession.permissionRequestHandler)
  assert.ok(ojSession.permissionCheckHandler)
  assert.ok(ojSession.permissionRequestHandler)

  assert.strictEqual(defaultSession.permissionCheckHandler?.(null, 'media', 'https://example.com', {}), false)
  assert.strictEqual(ojSession.permissionCheckHandler?.(null, 'fullscreen', 'https://example.com', {}), true)

  let requestGranted: boolean | null = null
  ojSession.permissionRequestHandler?.({}, 'geolocation', (granted: boolean) => {
    requestGranted = granted
  }, {})
  assert.strictEqual(requestGranted, false)
})
