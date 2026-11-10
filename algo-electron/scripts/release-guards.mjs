import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { extractFile } from '@electron/asar'
import { parseDocument } from 'yaml'
import { z } from 'zod'

export const REPOSITORY = 'xuoer-xuper/Algo-Learning-Platform'
export const VERSION = '2.0.1'
export const BASELINE = { tag: 'v2.0.0', sha: 'd2d2b0c6b758e1936b00aa602ea172dbb848b065' }
export const REQUIRED_CHECKS = [
  'Fast core, packaging and docs guard',
  'Electron and renderer smoke',
]
export const ACCEPTANCE_GATES = [
  'independentReview',
  'compatibilityReview',
  'isolatedInstallUpgrade',
  'dataPreservation',
  'failureRecovery',
  'uninstallReinstall',
  'sevenSitesAndSync',
  'corePages',
]

const sha = z.string().regex(/^[0-9a-f]{40}$/)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const identitySchema = z
  .object({
    version: z.literal(VERSION),
    masterSha: sha,
    sourceSha: sha,
    targetSha: sha,
    changelogSha256: sha256,
  })
  .strict()
const evidenceSchema = z
  .object({
    status: z.literal('passed'),
    sourceSha: sha,
    report: z.string().min(1),
    sha256,
  })
  .strict()
const acceptanceSchema = identitySchema
  .extend({
    formatVersion: z.literal(1),
    releasePr: z.number().int().positive(),
    buildReportSha256: sha256,
    approvedBy: z.string().trim().min(1),
    publicationAuthorized: z.literal(true),
    gates: z
      .object(Object.fromEntries(ACCEPTANCE_GATES.map((key) => [key, evidenceSchema])))
      .strict(),
  })
  .strict()
const assetSchema = z
  .object({ name: z.string(), size: z.number().int().positive(), sha256 })
  .strict()
export const buildSchema = identitySchema
  .extend({
    formatVersion: z.literal(1),
    status: z.literal('passed'),
    commands: z.tuple([z.literal('pnpm test:all'), z.literal('pnpm build:win')]),
    logs: z.array(assetSchema).length(2),
    assets: z.array(assetSchema).length(3),
    asarSha256: sha256,
  })
  .strict()

export function requireCondition(condition, message) {
  if (!condition) throw new Error(message)
}

export function digest(bytes, algorithm = 'sha256', encoding = 'hex') {
  return createHash(algorithm).update(bytes).digest(encoding)
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function parseIdentity(input) {
  return identitySchema.parse(input)
}

export function assetNames(version) {
  const installer = `AlgoLearningPlatform-Windows-${version}-x64-Setup.exe`
  return [installer, `${installer}.blockmap`, 'latest.yml']
}

export function outputDirectory(root, version) {
  return path.join(root, 'release', version)
}

export function releaseNotes(changelog, version) {
  const headings = [
    ...changelog.matchAll(/^##?\s+(?:\[)?(\d+\.\d+\.\d+(?:-[\w.]+)?)(?:\])?[^\r\n]*$/gm),
  ]
  requireCondition(
    headings[0]?.[1] === version,
    'Top changelog version must be the prepared version',
  )
  requireCondition(
    headings.filter((heading) => heading[1] === version).length === 1,
    'Duplicate release notes',
  )
  const start = headings[0].index
  const end = changelog.slice(start + headings[0][0].length).search(/^##?\s/m)
  const notes =
    end < 0 ? changelog.slice(start) : changelog.slice(start, start + headings[0][0].length + end)
  requireCondition(
    /^\s*\S/m.test(notes.slice(headings[0][0].length)),
    'Release notes must not be empty',
  )
  return notes.trim()
}

function requireRegularFile(file) {
  const stat = fs.lstatSync(file)
  requireCondition(
    stat.isFile() && stat.size > 0,
    `Missing, empty or non-regular file: ${path.basename(file)}`,
  )
  return stat
}

export async function hashFile(file, algorithm = 'sha256', encoding = 'hex') {
  requireRegularFile(file)
  const hash = createHash(algorithm)
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest(encoding)
}

export function localMetadata(root, identity) {
  const pkg = readJson(path.join(root, 'package.json'))
  requireCondition(
    pkg.version === identity.version && pkg.name === 'algo-electron' && pkg.private === true,
    'Source package identity mismatch',
  )
  const changelog = fs.readFileSync(path.join(root, '..', 'docs', 'PRODUCT', 'CHANGELOG.md'))
  requireCondition(
    digest(changelog) === identity.changelogSha256,
    'Reviewed changelog hash mismatch',
  )
  return releaseNotes(changelog.toString('utf8'), identity.version)
}

const remoteUrls = new Set([
  `https://github.com/${REPOSITORY}.git`,
  `https://github.com/${REPOSITORY}`,
  `git@github.com:${REPOSITORY}.git`,
  `ssh://git@github.com/${REPOSITORY}.git`,
])

export async function gitIdentity(run, identity, { preparation = false } = {}) {
  requireCondition(
    (await run('git', ['status', '--porcelain=v1', '--untracked-files=all'])).trim() === '',
    'Working tree must be clean, including untracked files',
  )
  requireCondition(
    remoteUrls.has((await run('git', ['remote', 'get-url', 'origin'])).trim()),
    'Unexpected origin fetch URL',
  )
  const pushUrls = (await run('git', ['remote', 'get-url', '--push', '--all', 'origin']))
    .trim()
    .split(/\r?\n/)
  requireCondition(
    pushUrls.length === 1 && remoteUrls.has(pushUrls[0]),
    'Unexpected origin push URL',
  )
  const branch = (await run('git', ['branch', '--show-current'])).trim()
  if (preparation) {
    requireCondition(
      branch !== '' && branch !== 'master' && branch !== 'dev',
      'Prepare only on a PR branch',
    )
    requireCondition(
      (await run('git', ['rev-parse', `${BASELINE.tag}^{commit}`])).trim() === BASELINE.sha,
      'Published baseline commit mismatch',
    )
    const refs = parseRefs(
      await run('git', [
        'ls-remote',
        '--tags',
        'origin',
        `refs/tags/${BASELINE.tag}`,
        `refs/tags/${BASELINE.tag}^{}`,
      ]),
    )
    requireCondition(
      (refs.get(`refs/tags/${BASELINE.tag}^{}`) ?? refs.get(`refs/tags/${BASELINE.tag}`)) ===
        BASELINE.sha,
      'Remote published baseline mismatch',
    )
    return
  }
  requireCondition(branch === 'master', 'Publication source must be master')
  requireCondition(
    (await run('git', ['rev-parse', '--abbrev-ref', '@{upstream}'])).trim() === 'origin/master',
    'Master must track origin/master',
  )
  await run('git', ['fetch', '--no-tags', 'origin', 'refs/heads/master:refs/remotes/origin/master'])
  const head = (await run('git', ['rev-parse', 'HEAD'])).trim()
  const fetched = (await run('git', ['rev-parse', 'refs/remotes/origin/master'])).trim()
  const remote = parseRefs(
    await run('git', ['ls-remote', '--heads', 'origin', 'refs/heads/master']),
  )
  requireCondition(
    head === identity.masterSha && fetched === head && remote.get('refs/heads/master') === head,
    'Accepted master SHA must equal HEAD and fresh origin/master',
  )
  const parents = (await run('git', ['show', '-s', '--format=%P', 'HEAD'])).trim().split(' ')
  requireCondition(
    parents.length === 2 && parents[0] === identity.targetSha && parents[1] === identity.sourceSha,
    'Release merge parents must match accepted target and source, in order',
  )
}

export function parseRefs(text) {
  const refs = new Map()
  for (const line of text.trim().split(/\r?\n/).filter(Boolean)) {
    const match = /^([0-9a-f]{40})\s+(refs\/\S+)$/.exec(line)
    requireCondition(match, 'Malformed remote ref response')
    requireCondition(!refs.has(match[2]), 'Duplicate remote ref response')
    refs.set(match[2], match[1])
  }
  return refs
}

export async function githubJson(run, suffix) {
  return JSON.parse(await run('gh', ['api', `repos/${REPOSITORY}/${suffix}`]))
}

export async function pagedGithub(run, suffix, property) {
  const pages = JSON.parse(
    await run('gh', ['api', '--paginate', '--slurp', `repos/${REPOSITORY}/${suffix}`]),
  )
  requireCondition(Array.isArray(pages) && pages.length > 0, 'Missing paginated GitHub response')
  return pages.flatMap((page) => {
    const entries = property ? page[property] : page
    requireCondition(Array.isArray(entries), 'Malformed paginated GitHub response')
    return entries
  })
}

export async function checkNoRelease(run, version) {
  const tag = `v${version}`
  requireCondition(
    (await run('git', ['for-each-ref', '--format=%(refname)', `refs/tags/${tag}`])).trim() === '',
    'Target tag already exists locally; inspect before retry',
  )
  const remoteTags = await run('git', [
    'ls-remote',
    '--tags',
    'origin',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ])
  requireCondition(
    parseRefs(remoteTags).size === 0,
    'Target tag already exists remotely; inspect before retry',
  )
  const repository = JSON.parse(await run('gh', ['api', `repos/${REPOSITORY}`]))
  requireCondition(
    repository.full_name === REPOSITORY && repository.permissions?.push === true,
    'Authenticated release access is required, including draft visibility',
  )
  const releases = await pagedGithub(run, 'releases?per_page=100')
  requireCondition(
    releases.every((release) => typeof release.tag_name === 'string'),
    'Malformed release response',
  )
  requireCondition(
    !releases.some((release) => release.tag_name === tag),
    'Target GitHub Release already exists; inspect before retry',
  )
}

export async function validateAssets(root, identity, run) {
  const directory = outputDirectory(root, identity.version)
  const names = assetNames(identity.version)
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  const unexpectedEntries = entries
    .filter(
      (entry) =>
        (entry.isFile() &&
          ![...names, 'builder-debug.yml', 'builder-effective-config.yaml'].includes(entry.name)) ||
        (entry.isDirectory() && entry.name !== 'win-unpacked'),
    )
    .map((entry) => entry.name)
  requireCondition(
    unexpectedEntries.length === 0,
    `Unexpected release output entries: ${unexpectedEntries.join(', ')}`,
  )
  const artifacts = entries
    .filter((entry) => entry.isFile() && names.includes(entry.name))
    .map((entry) => entry.name)
  requireCondition(
    JSON.stringify(artifacts.sort()) === JSON.stringify([...names].sort()),
    'Expected exactly the installer, blockmap and latest.yml',
  )
  const assets = []
  for (const name of names) {
    const file = path.join(directory, name)
    assets.push({ name, size: requireRegularFile(file).size, sha256: await hashFile(file) })
  }
  const document = parseDocument(fs.readFileSync(path.join(directory, 'latest.yml'), 'utf8'), {
    uniqueKeys: true,
  })
  requireCondition(document.errors.length === 0, 'Invalid latest.yml')
  const metadata = document.toJS({ maxAliasCount: 0 })
  const installer = assets[0]
  const sha512 = await hashFile(path.join(directory, installer.name), 'sha512', 'base64')
  requireCondition(metadata?.version === identity.version, 'latest.yml version mismatch')
  requireCondition(
    Array.isArray(metadata.files) && metadata.files.length === 1,
    'latest.yml must name exactly one installer',
  )
  requireCondition(
    metadata.files[0].url === installer.name && metadata.path === installer.name,
    'latest.yml installer filename mismatch',
  )
  requireCondition(metadata.files[0].size === installer.size, 'latest.yml installer size mismatch')
  requireCondition(
    metadata.files[0].sha512 === sha512 && metadata.sha512 === sha512,
    'latest.yml installer SHA512 mismatch',
  )
  const asar = path.join(directory, 'win-unpacked', 'resources', 'app.asar')
  requireRegularFile(asar)
  const packaged = JSON.parse(extractFile(asar, 'package.json').toString('utf8'))
  requireCondition(
    packaged.version === identity.version &&
      packaged.name === 'algo-electron' &&
      packaged.main === 'dist-electron/main.js',
    'Packaged package identity mismatch',
  )
  for (const file of [
    path.join(directory, installer.name),
    path.join(directory, 'win-unpacked', 'AlgoLearningPlatform.exe'),
  ]) {
    requireRegularFile(file)
    const info = JSON.parse(
      await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$v = (Get-Item -LiteralPath $env:RELEASE_EXE_PATH).VersionInfo; @{ file = $v.FileVersion; product = $v.ProductVersion } | ConvertTo-Json -Compress',
        ],
        { env: { RELEASE_EXE_PATH: file } },
      ),
    )
    for (const version of [info.file, info.product]) {
      requireCondition(
        version === identity.version || version === `${identity.version}.0`,
        'Executable version resource mismatch',
      )
    }
  }
  return { assets, asarSha256: await hashFile(asar) }
}

export async function loadAcceptance(root, filename) {
  const acceptance = acceptanceSchema.parse(readJson(filename))
  const evidenceRoot = fs.realpathSync(path.join(root, 'tmp', 'release-acceptance'))
  for (const evidence of Object.values(acceptance.gates)) {
    requireCondition(
      evidence.sourceSha === acceptance.masterSha,
      'Acceptance evidence belongs to a different source',
    )
    requireCondition(
      !path.isAbsolute(evidence.report),
      'Evidence report must be relative to tmp/release-acceptance',
    )
    const file = fs.realpathSync(path.resolve(evidenceRoot, evidence.report))
    requireCondition(
      file.startsWith(`${evidenceRoot}${path.sep}`),
      'Evidence report escapes acceptance directory',
    )
    requireCondition((await hashFile(file)) === evidence.sha256, 'Acceptance report hash mismatch')
  }
  return acceptance
}

export async function checkAcceptedCi(run, acceptance) {
  const pr = await githubJson(run, `pulls/${acceptance.releasePr}`)
  requireCondition(
    pr.merged === true &&
      pr.merge_commit_sha === acceptance.masterSha &&
      pr.head?.sha === acceptance.sourceSha &&
      pr.head?.ref === 'dev' &&
      pr.head?.repo?.full_name === REPOSITORY &&
      pr.base?.ref === 'master' &&
      pr.base?.repo?.full_name === REPOSITORY,
    'Accepted release PR does not identify this dev -> master merge',
  )
  for (const [commit, names] of [
    [acceptance.sourceSha, REQUIRED_CHECKS],
    [acceptance.masterSha, REQUIRED_CHECKS.slice(0, 1)],
  ]) {
    const checks = await pagedGithub(
      run,
      `commits/${commit}/check-runs?per_page=100&filter=latest`,
      'check_runs',
    )
    for (const name of names) {
      const matches = checks.filter(
        (check) => check.name === name && check.app?.slug === 'github-actions',
      )
      requireCondition(
        matches.length === 1 &&
          matches[0].head_sha === commit &&
          matches[0].status === 'completed' &&
          matches[0].conclusion === 'success',
        `Required CI is not successful: ${name}`,
      )
    }
  }
}
