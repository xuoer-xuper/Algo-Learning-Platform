import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseIdentity, readJson, requireCondition } from './release-guards.mjs'
import {
  assertNormalHooks,
  assertSafeEnvironment,
  buildRelease,
  draftRelease,
  guardPreparation,
  preflight,
  prepareRelease,
  publishRelease,
  verifyRemote,
} from './release-workflow.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

export function commandRunner(command, args, options = {}) {
  let executable = command
  let argumentsList = args
  if (command === 'node') executable = process.execPath
  if (command === 'pnpm') {
    const cli = process.env.npm_execpath
    requireCondition(
      cli && /pnpm\.(?:c?js)$/.test(cli) && fs.existsSync(cli),
      'Run release commands via pnpm run (pnpm CLI identity required)',
    )
    executable = process.execPath
    argumentsList = [cli, ...args]
  }
  const result = spawnSync(executable, argumentsList, {
    cwd: root,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (options.logFile) {
    fs.writeFileSync(options.logFile, `${result.stdout ?? ''}\n${result.stderr ?? ''}`, {
      flag: 'wx',
    })
  }
  // Do not echo raw API/auth responses or environment variables, including on failure.
  requireCondition(
    !result.error && result.status === 0,
    `${command} ${args[0] ?? ''} failed; stop and inspect local/remote state before retry (exit ${result.status ?? 'unavailable'})`,
  )
  return result.stdout
}

function flags(argv, allowed) {
  const values = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    requireCondition(
      allowed.includes(key) &&
        argv[i + 1] &&
        !argv[i + 1].startsWith('--') &&
        values[key] === undefined,
      'Unexpected or missing argument; dry-run is not release acceptance',
    )
    values[key] = argv[i + 1]
  }
  for (const key of allowed) requireCondition(values[key], `Missing required argument: ${key}`)
  return values
}

export async function main(argv, { run = commandRunner, environment = process.env } = {}) {
  const [command, ...args] = argv
  if (!command || command === 'help') {
    throw new Error(
      'Publication is not a one-command bump. Read docs/OPERATIONS/RELEASE_PROCESS.md. Use release:prepare, release:build, release:check, release:draft, release:verify and separately authorized release:publish. No --dry-run acceptance.',
    )
  }
  assertSafeEnvironment(environment)
  await assertNormalHooks(run)
  if (command === 'guard-prepare') {
    requireCondition(
      args.length === 0 && environment.RELEASE_PREPARE_VERSION === '2.0.1',
      'Use release:prepare with an explicit candidate version',
    )
    return guardPreparation(run)
  }
  if (command === 'prepare') {
    const values = flags(args, ['--version'])
    return prepareRelease({ root, run, version: values['--version'] })
  }
  if (command === 'build') {
    const values = flags(args, ['--identity'])
    return buildRelease({ root, run, identity: parseIdentity(readJson(values['--identity'])) })
  }
  if (command === 'guard-tag') {
    requireCondition(
      args.length === 0 &&
        environment.RELEASE_ACCEPTANCE_FILE &&
        environment.RELEASE_DRAFT_CONFIRMATION,
      'Local tag configuration requires the guarded draft command',
    )
    const result = await preflight({
      root,
      run,
      acceptanceFile: environment.RELEASE_ACCEPTANCE_FILE,
    })
    requireCondition(
      environment.RELEASE_DRAFT_CONFIRMATION ===
        `draft-v${result.acceptance.version}@${result.acceptance.masterSha}`,
      'Tag authorization mismatch',
    )
    return
  }
  requireCondition(
    ['check', 'draft', 'verify', 'publish'].includes(command),
    'Unknown release command',
  )
  const allowed = ['--acceptance', ...(['draft', 'publish'].includes(command) ? ['--confirm'] : [])]
  const values = flags(args, allowed)
  const options = { root, run, acceptanceFile: path.resolve(values['--acceptance']) }
  if (command === 'check') return preflight(options)
  if (command === 'verify') return verifyRemote(options)
  if (command === 'draft') return draftRelease(options, values['--confirm'])
  return publishRelease(options, values['--confirm'])
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    () => console.log('Release step verified. This is not authorization for the next step.'),
    (error) => {
      console.error(error instanceof Error ? error.message : 'Release step failed')
      process.exitCode = 1
    },
  )
}
