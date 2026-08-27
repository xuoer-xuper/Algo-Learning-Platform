import path from 'node:path'

/**
 * Single source of truth for what counts as an app-managed userscript file.
 *
 * Two writers produce files in `userData/userscripts`:
 * - legacy editor-created scripts, named after their row UUID;
 * - importer/installer output, named `<slug>--<identityHash>--<contentHash>.user.js`.
 *
 * Anything else in that directory belongs to the user (or another tool) and must
 * never be deleted by cleanup paths. These patterns previously existed in two
 * copies, which meant the delete path could drift away from the install path.
 */
const UUID_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.js$/i
const MANAGED_IMPORT_FILE_PATTERN = /^.+--[0-9a-f]{12}--[0-9a-f]{12}\.user\.js$/i

export function isManagedScriptArtifactName(baseName: string): boolean {
  return UUID_FILE_PATTERN.test(baseName) || MANAGED_IMPORT_FILE_PATTERN.test(baseName)
}

/**
 * Resolves a stored `file_path` to a path that is provably a direct child of the
 * managed directory, or null. Rejects traversal, nested directories and
 * non-`.js` names so callers can never read or unlink outside the sandbox.
 */
export function resolveManagedScriptPath(
  filePath: string | null | undefined,
  scriptsDirectory: string,
): string | null {
  if (!filePath) return null
  const root = path.resolve(scriptsDirectory)
  const resolved = path.resolve(filePath)
  if (path.dirname(resolved) !== root) return null
  if (!/\.js$/i.test(path.basename(resolved))) return null
  return resolved
}
