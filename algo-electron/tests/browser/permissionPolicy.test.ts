import assert from 'node:assert/strict'
import { test } from 'vitest'
// session 从替身导入：它的 fromPartition/defaultSession 本来就返回 MockSession，
// 走 'electron' 拿到的是真实 Session 类型，只能靠 `as MockSession` 强转回来——
// 那两处强转除了骗过编译器没别的作用，导入对了就不需要了。
import { resetElectronMock, session } from '../electron/electronMock'
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

  const defaultSession = session.defaultSession
  const ojSession = session.fromPartition('persist:oj-main')
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
