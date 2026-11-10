import type { Logger } from '../../../electron/shared/logger'

interface MigrationDiagnostic {
  stage: string
  error: unknown
}

const diagnostics = new WeakMap<object, MigrationDiagnostic[]>()

export function retainMigrationDiagnostic(primary: unknown, stage: string, error: unknown): void {
  if ((typeof primary !== 'object' || primary === null) && typeof primary !== 'function') return
  const entries = diagnostics.get(primary) ?? []
  entries.push({ stage, error })
  diagnostics.set(primary, entries)
}

export function getMigrationDiagnostics(primary: object): readonly MigrationDiagnostic[] {
  return diagnostics.get(primary) ?? []
}

export function reportMigrationDiagnostic(
  primary: unknown,
  stage: string,
  error: unknown,
  logger: Logger,
): void {
  retainMigrationDiagnostic(primary, stage, error)
  try {
    logger.error(stage, { error })
  } catch (loggingError) {
    // Diagnostic failures must not replace the migration/IO error being handled.
    retainMigrationDiagnostic(primary, 'db.migration-diagnostic-log-failed', loggingError)
  }
}
