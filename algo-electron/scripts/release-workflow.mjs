import fs from 'node:fs'
import path from 'node:path'
import {
  BASELINE,
  REPOSITORY,
  VERSION,
  assetNames,
  buildSchema,
  checkAcceptedCi,
  checkNoRelease,
  gitIdentity,
  githubJson,
  hashFile,
  loadAcceptance,
  localMetadata,
  outputDirectory,
  pagedGithub,
  parseIdentity,
  parseRefs,
  readJson,
  releaseNotes,
  requireCondition,
  validateAssets,
} from './release-guards.mjs'

function evidenceDirectory(root) {
  return path.join(root, 'tmp', 'release-acceptance')
}

export function buildReportPath(root) {
  return path.join(evidenceDirectory(root), 'build.json')
}

function saveNewJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' })
}

function sameAssets(actual, expected) {
  requireCondition(
    JSON.stringify(actual) === JSON.stringify(expected),
    'Assets differ from the accepted build',
  )
}

function sameIdentity(actual, expected) {
  for (const key of ['version', 'masterSha', 'sourceSha', 'targetSha', 'changelogSha256']) {
    requireCondition(actual[key] === expected[key], `Evidence identity mismatch: ${key}`)
  }
}

export async function prepareRelease({ root, run, version }) {
  requireCondition(
    version === VERSION,
    `Preparation requires the explicitly reviewed candidate ${VERSION}`,
  )
  await guardPreparation(run)
  await run(
    'node',
    [
      'node_modules/release-it/bin/release-it.js',
      '-c',
      '.release-it.prepare.json',
      version,
      '--ci',
    ],
    { env: { RELEASE_PREPARE_VERSION: version } },
  )
  requireCondition(
    readJson(path.join(root, 'package.json')).version === version,
    'Preparation wrote an unexpected version',
  )
  releaseNotes(
    fs.readFileSync(path.join(root, '..', 'docs', 'PRODUCT', 'CHANGELOG.md'), 'utf8'),
    version,
  )
  // Preparation intentionally leaves only metadata edits for a normal reviewed PR commit.
  const changed = (await run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all']))
    .split('\0')
    .filter(Boolean)
  requireCondition(
    changed.every((entry) =>
      /^(?: M|M |MM) (?:algo-electron\/package\.json|docs\/PRODUCT\/CHANGELOG\.md)$/.test(entry),
    ),
    'Unexpected preparation changes; inspect without resetting',
  )
}

export async function guardPreparation(run) {
  await gitIdentity(run, null, { preparation: true })
  await checkNoRelease(run, VERSION)
  const baseline = await githubJson(run, `releases/tags/${BASELINE.tag}`)
  requireCondition(
    baseline.tag_name === BASELINE.tag && baseline.draft === false && baseline.prerelease === false,
    'Preparation baseline must be the actual published stable release',
  )
  const latest = await githubJson(run, 'releases/latest')
  requireCondition(
    latest.tag_name === BASELINE.tag && latest.draft === false && latest.prerelease === false,
    'Preparation baseline is stale; review the next candidate and actual shipped baseline first',
  )
}

export async function buildRelease({ root, run, identity: input }) {
  const identity = parseIdentity(input)
  localMetadata(root, identity)
  await gitIdentity(run, identity)
  await checkNoRelease(run, identity.version)
  requireCondition(
    !fs.existsSync(outputDirectory(root, identity.version)),
    'Build output already exists; preserve/inspect it and build in a fresh checkout',
  )
  requireCondition(
    !fs.existsSync(buildReportPath(root)),
    'Build evidence already exists; preserve/inspect it before another build',
  )
  fs.mkdirSync(evidenceDirectory(root), { recursive: true })
  const logs = []
  for (const command of ['test:all', 'build:win']) {
    const name = `${command.replace(':', '-')}.log`
    const logFile = path.join(evidenceDirectory(root), name)
    requireCondition(
      !fs.existsSync(logFile),
      'Previous gate log exists; inspect the failed attempt before retry',
    )
    await run('pnpm', ['run', command], { logFile })
    logs.push({ name, size: fs.statSync(logFile).size, sha256: await hashFile(logFile) })
  }
  localMetadata(root, identity)
  await gitIdentity(run, identity)
  const files = await validateAssets(root, identity, run)
  const report = {
    formatVersion: 1,
    ...identity,
    status: 'passed',
    commands: ['pnpm test:all', 'pnpm build:win'],
    logs,
    ...files,
  }
  saveNewJson(buildReportPath(root), buildSchema.parse(report))
  return report
}

export async function preflight({ root, run, acceptanceFile }, { absent = true } = {}) {
  const acceptance = await loadAcceptance(root, acceptanceFile)
  const notes = localMetadata(root, acceptance)
  await gitIdentity(run, acceptance)
  await checkAcceptedCi(run, acceptance)
  if (absent) await checkNoRelease(run, acceptance.version)
  const build = buildSchema.parse(readJson(buildReportPath(root)))
  requireCondition(
    (await hashFile(buildReportPath(root))) === acceptance.buildReportSha256,
    'Accepted build report hash mismatch',
  )
  sameIdentity(build, acceptance)
  requireCondition(
    JSON.stringify(build.logs.map((log) => log.name)) ===
      JSON.stringify(['test-all.log', 'build-win.log']),
    'Build log identity mismatch',
  )
  for (const log of build.logs) {
    const file = path.join(evidenceDirectory(root), log.name)
    requireCondition(
      fs.statSync(file).size === log.size && (await hashFile(file)) === log.sha256,
      'Build log changed since acceptance',
    )
  }
  const files = await validateAssets(root, acceptance, run)
  sameAssets(files.assets, build.assets)
  requireCondition(
    files.asarSha256 === build.asarSha256,
    'Packaged asar changed since accepted build',
  )
  return { acceptance, notes, build }
}

async function verifyRemoteTag(run, acceptance) {
  const tag = `v${acceptance.version}`
  requireCondition(
    (await run('git', ['cat-file', '-t', `refs/tags/${tag}`])).trim() === 'tag',
    'Local release tag is not annotated',
  )
  requireCondition(
    (await run('git', ['rev-parse', `${tag}^{commit}`])).trim() === acceptance.masterSha,
    'Local tag commit mismatch',
  )
  const localTag = (await run('git', ['rev-parse', `refs/tags/${tag}`])).trim()
  const refs = parseRefs(
    await run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]),
  )
  requireCondition(
    refs.size === 2 &&
      refs.get(`refs/tags/${tag}`) === localTag &&
      refs.get(`refs/tags/${tag}^{}`) === acceptance.masterSha,
    'Remote annotated tag does not match the accepted merge',
  )
  const ref = await githubJson(run, `git/ref/tags/${tag}`)
  requireCondition(
    ref.object?.type === 'tag' && ref.object.sha === localTag,
    'GitHub tag object mismatch',
  )
  const object = await githubJson(run, `git/tags/${localTag}`)
  requireCondition(
    object.tag === tag &&
      object.object?.type === 'commit' &&
      object.object.sha === acceptance.masterSha &&
      object.message.trim() === tag,
    'GitHub annotated tag target/message mismatch',
  )
}

export async function verifyRemote(options, { draft = true } = {}) {
  const { root, run } = options
  const { acceptance, notes, build } = await preflight(options, { absent: false })
  await verifyRemoteTag(run, acceptance)
  const releases = await pagedGithub(run, 'releases?per_page=100')
  const matching = releases.filter((release) => release.tag_name === `v${acceptance.version}`)
  requireCondition(matching.length === 1, 'Expected exactly one target release')
  const release = matching[0]
  requireCondition(
    Number.isSafeInteger(release.id) &&
      release.id > 0 &&
      release.draft === draft &&
      release.prerelease === false &&
      release.target_commitish === acceptance.masterSha &&
      release.body === notes,
    'Release draft/source/notes identity mismatch',
  )
  const remoteAssets = await pagedGithub(run, `releases/${release.id}/assets?per_page=100`)
  requireCondition(
    remoteAssets.length === build.assets.length,
    'Remote release asset count mismatch',
  )
  for (const asset of build.assets) {
    const matches = remoteAssets.filter((remote) => remote.name === asset.name)
    requireCondition(
      matches.length === 1 && matches[0].state === 'uploaded' && matches[0].size === asset.size,
      'Remote asset name/state/size mismatch',
    )
  }
  const downloadDir = fs.mkdtempSync(path.join(evidenceDirectory(root), 'verify-'))
  // Keep downloaded evidence after failures; never overwrite local build artifacts or retry uploads.
  await run('gh', [
    'release',
    'download',
    `v${acceptance.version}`,
    '--repo',
    REPOSITORY,
    '--dir',
    downloadDir,
  ])
  for (const asset of build.assets) {
    const matches = remoteAssets.filter((remote) => remote.name === asset.name)
    const downloaded = path.join(downloadDir, asset.name)
    requireCondition(
      fs.lstatSync(downloaded).isFile() &&
        fs.statSync(downloaded).size === asset.size &&
        (await hashFile(downloaded)) === asset.sha256,
      'Downloaded asset SHA256/size mismatch',
    )
    if (matches[0].digest != null)
      requireCondition(
        matches[0].digest === `sha256:${asset.sha256}`,
        'GitHub asset digest mismatch',
      )
  }
  const verification = {
    formatVersion: 1,
    status: draft ? 'verified-draft' : 'verified-public',
    version: acceptance.version,
    sourceSha: acceptance.masterSha,
    releaseId: release.id,
    acceptanceSha256: await hashFile(options.acceptanceFile),
    assets: build.assets,
  }
  saveNewJson(path.join(downloadDir, 'verification.json'), verification)
  return verification
}

export async function draftRelease(options, confirmation) {
  const { root, run, acceptanceFile } = options
  const { acceptance, notes } = await preflight(options)
  requireCondition(
    confirmation === `draft-v${acceptance.version}@${acceptance.masterSha}`,
    'Explicit draft authorization must identify the accepted SHA',
  )
  const attemptFile = path.join(evidenceDirectory(root), 'draft-attempt.json')
  saveNewJson(attemptFile, {
    status: 'started-inspect-before-retry',
    sourceSha: acceptance.masterSha,
    acceptanceSha256: await hashFile(acceptanceFile),
  })
  const notesFile = path.join(evidenceDirectory(root), 'release-notes.md')
  fs.writeFileSync(notesFile, notes, { flag: 'wx' })
  await run(
    'node',
    [
      'node_modules/release-it/bin/release-it.js',
      '-c',
      '.release-it.publish.json',
      '--no-increment',
      '--ci',
    ],
    {
      env: {
        RELEASE_ACCEPTANCE_FILE: path.resolve(acceptanceFile),
        RELEASE_DRAFT_CONFIRMATION: confirmation,
      },
    },
  )
  requireCondition(
    (await run('git', ['cat-file', '-t', `refs/tags/v${acceptance.version}`])).trim() === 'tag',
    'Expected annotated local tag',
  )
  requireCondition(
    (await run('git', ['rev-parse', `v${acceptance.version}^{commit}`])).trim() ===
      acceptance.masterSha,
    'New tag target mismatch',
  )
  localMetadata(root, acceptance)
  await gitIdentity(run, acceptance)
  // Push only this tag with ordinary hooks, avoiding release-it's automatic remote-tag rollback.
  const tagRef = `refs/tags/v${acceptance.version}`
  await run('git', ['push', 'origin', `${tagRef}:${tagRef}`])
  // Pre-push runs the normal full CI hook; recheck its local and remote side effects before upload.
  await preflight(options, { absent: false })
  await verifyRemoteTag(run, acceptance)
  await run('gh', [
    'release',
    'create',
    `v${acceptance.version}`,
    '--repo',
    REPOSITORY,
    '--draft',
    '--verify-tag',
    '--target',
    acceptance.masterSha,
    '--title',
    `v${acceptance.version}`,
    '--notes-file',
    notesFile,
    ...assetNames(acceptance.version).map((name) =>
      path.join(outputDirectory(root, acceptance.version), name),
    ),
  ])
  return verifyRemote(options)
}

export async function publishRelease(options, confirmation) {
  const verification = await verifyRemote(options)
  requireCondition(
    confirmation === `publish-v${verification.version}@${verification.sourceSha}`,
    'Explicit public-release authorization must identify the accepted SHA',
  )
  saveNewJson(path.join(evidenceDirectory(options.root), 'publish-attempt.json'), {
    ...verification,
    status: 'started-inspect-before-retry',
  })
  // No automatic retry: an uncertain PATCH result must be inspected remotely before further action.
  await options.run('gh', [
    'api',
    '--method',
    'PATCH',
    `repos/${REPOSITORY}/releases/${verification.releaseId}`,
    '-F',
    'draft=false',
    '-f',
    'make_latest=true',
  ])
  return verifyRemote(options, { draft: false })
}

export function assertSafeEnvironment(environment) {
  for (const key of [
    'ARK_DEMO_KEY',
    'NODE_OPTIONS',
    'ELECTRON_RUN_AS_NODE',
    'ALGO_ELECTRON_SMOKE',
    'HUSKY',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_PARAMETERS',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_SSH_COMMAND',
  ]) {
    requireCondition(!environment[key], `Remove release-unsafe environment override: ${key}`)
  }
  requireCondition(
    !environment.GH_HOST || environment.GH_HOST === 'github.com',
    'Release host must be github.com',
  )
}

export async function assertNormalHooks(run) {
  const hooks = (await run('git', ['config', '--get', 'core.hooksPath']))
    .trim()
    .replaceAll('\\', '/')
  requireCondition(
    hooks === 'algo-electron/.husky/_',
    'Normal repository Husky hooks must be enabled',
  )
}
