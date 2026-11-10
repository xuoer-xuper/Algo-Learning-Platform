import { z } from 'zod'

export const upgradeResolutionSchema = z.enum(['keep-current', 'retry-source'])
export type UpgradeResolution = z.infer<typeof upgradeResolutionSchema>
export const upgradeMaintenanceRequestSchema = z
  .object({
    attemptId: z.uuid(),
    resolution: upgradeResolutionSchema,
  })
  .strict()
export type UpgradeMaintenanceRequest = z.infer<typeof upgradeMaintenanceRequestSchema>

export type UpgradeMaintenanceCommand =
  | { kind: 'normal' }
  | { kind: 'invalid'; message: string }
  | { kind: 'resolve'; request: UpgradeMaintenanceRequest }

const USAGE =
  'Use --resolve-upgrade=<attempt UUID> --resolution=keep-current|retry-source. Close the application first. No database, backup, or profile path arguments are accepted.'

export function parseUpgradeMaintenanceCommand(argv: readonly string[]): UpgradeMaintenanceCommand {
  const maintenanceFlag =
    /^--(?:resolve(?:-|=|$)|resolution(?:-|=|$)|recover|restore|upgrade|migration)/
  if (!argv.some((argument) => maintenanceFlag.test(argument))) return { kind: 'normal' }
  const flags = argv
  if (
    flags.length !== 2 ||
    flags.some((flag) => !/^--(?:resolve-upgrade|resolution)=/.test(flag))
  ) {
    return { kind: 'invalid', message: USAGE }
  }
  const attempts = flags.filter((flag) => flag.startsWith('--resolve-upgrade='))
  const resolutions = flags.filter((flag) => flag.startsWith('--resolution='))
  if (attempts.length !== 1 || resolutions.length !== 1) return { kind: 'invalid', message: USAGE }
  const parsed = upgradeMaintenanceRequestSchema.safeParse({
    attemptId: attempts[0].slice('--resolve-upgrade='.length),
    resolution: resolutions[0].slice('--resolution='.length),
  })
  return parsed.success
    ? { kind: 'resolve', request: parsed.data }
    : { kind: 'invalid', message: USAGE }
}

export function upgradeResolutionInstructions(attemptId: string): string {
  const id = z.uuid().parse(attemptId)
  return [
    `Upgrade attempt: ${id}`,
    'Close the application and preserve its database, recovery files, and backups.',
    `If the upgrade finished, verify and keep all current data with: AlgoLearningPlatform.exe --resolve-upgrade=${id} --resolution=keep-current`,
    `Only after fixing the original failure and confirming source restoration, authorize a new attempt with: AlgoLearningPlatform.exe --resolve-upgrade=${id} --resolution=retry-source`,
    'These commands verify and protect current data; neither command restores an old snapshot. Partial or unknown states remain blocked. Restart normally only after success.',
  ].join('\n')
}
