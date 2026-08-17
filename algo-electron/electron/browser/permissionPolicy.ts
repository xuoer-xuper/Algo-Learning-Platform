import type { Session } from 'electron'

type PermissionSession = Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>

const ALLOWED_PERMISSIONS = new Set([
  'clipboard-sanitized-write',
  'fullscreen',
  'storage-access',
  'top-level-storage-access',
])

export function isBrowserPermissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission)
}

export function installBrowserPermissionPolicy(target: PermissionSession): void {
  target.setPermissionCheckHandler((_webContents, permission) => {
    return isBrowserPermissionAllowed(permission)
  })

  target.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(isBrowserPermissionAllowed(permission))
  })
}
