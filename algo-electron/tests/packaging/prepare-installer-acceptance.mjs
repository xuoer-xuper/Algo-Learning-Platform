import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPOSITORY, VERSION, validateAssets } from '../../scripts/release-guards.mjs'

const BASELINE_NAME = 'AlgoLearningPlatform-Windows-2.0.0-x64-Setup.exe'
const BASELINE_SIZE = 121203039
const BASELINE_SHA256 = '5576cab81b879f192b01e5867a81c192297353f3767310efe7f904079d7c6ccc'
const NODE_VERSION = '22.23.2'

function samePath(actual, expected) {
  return path.resolve(actual).toLowerCase() === path.resolve(expected).toLowerCase()
}

function assertNoLinks(file) {
  let component = path.resolve(file)
  for (;;) {
    if (fs.existsSync(component)) {
      const stat = fs.lstatSync(component)
      assert.equal(stat.isSymbolicLink(), false, 'Installer inputs must not contain links')
      if (stat.isFile()) assert.equal(stat.nlink, 1, 'Installer inputs must not be hard-linked')
      assert.ok(samePath(fs.realpathSync.native(component), component), 'Unexpected real path')
    }
    const parent = path.dirname(component)
    if (component === parent) break
    component = parent
  }
}

function assertChild(file, root) {
  assert.ok(path.isAbsolute(file) && path.isAbsolute(root), 'Absolute paths required')
  const relative = path.relative(root, file)
  assert.ok(
    relative.length > 0 &&
      relative !== '..' &&
      !relative.startsWith('..' + path.sep) &&
      !path.isAbsolute(relative),
    'Path escaped the runner temporary directory',
  )
  assertNoLinks(file)
}

function sha256(file) {
  assertNoLinks(file)
  assert.ok(fs.statSync(file).isFile(), 'Expected a regular input file')
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function run(command, args, cwd, environment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  })
  if (result.error || result.status !== 0) {
    // Never echo external output that could contain runner tokens or authentication diagnostics.
    throw new Error(
      command + ' failed while preparing installer acceptance (exit ' + result.status + ')',
    )
  }
  return result.stdout
}

function assertClean(root) {
  assert.equal(
    run('git', ['status', '--porcelain=v1', '--untracked-files=all'], root),
    '',
    'Installer acceptance requires clean tracked and untracked source',
  )
}

export function assertHostedRunner(
  env = process.env,
  platform = process.platform,
  user = os.userInfo(),
) {
  assert.equal(platform, 'win32', 'Installer acceptance requires Windows')
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Installer acceptance requires GitHub Actions')
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted', 'Self-hosted runners are refused')
  assert.equal(env.RUNNER_OS, 'Windows', 'Windows runner required')
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY, 'Unexpected repository')
  assert.match(env.GITHUB_RUN_ID ?? '', /^[1-9][0-9]*$/)
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^[1-9][0-9]*$/)
  assert.match(env.GITHUB_SHA ?? '', /^[0-9a-f]{40}$/)
  assert.ok(path.isAbsolute(env.RUNNER_TEMP ?? ''), 'Absolute RUNNER_TEMP required')
  assert.ok(samePath(env.USERPROFILE ?? '', user.homedir), 'Unexpected user profile')
  assert.ok(
    samePath(env.APPDATA ?? '', path.join(user.homedir, 'AppData', 'Roaming')),
    'Unexpected APPDATA',
  )
  assert.ok(
    samePath(env.LOCALAPPDATA ?? '', path.join(user.homedir, 'AppData', 'Local')),
    'Unexpected LOCALAPPDATA',
  )
  assertNoLinks(env.RUNNER_TEMP)
  assertNoLinks(user.homedir)
  for (const key of Object.keys(env)) {
    assert.equal(key.startsWith('ALGO_ELECTRON_SMOKE_'), false, 'No smoke-mode redirection allowed')
    assert.equal(
      ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'VITE_DEV_SERVER_URL'].includes(key),
      false,
      'Runtime override environment is forbidden',
    )
  }
}

function sourceSnapshot(repositoryRoot) {
  const names = [
    ...new Set(
      run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], repositoryRoot)
        .split('\0')
        .filter(Boolean),
    ),
  ].sort()
  const files = names.map((name) => {
    const file = path.join(repositoryRoot, name)
    assertChild(file, repositoryRoot)
    if (!fs.existsSync(file)) return { path: name, size: null, sha256: null }
    return { path: name, size: fs.statSync(file).size, sha256: sha256(file) }
  })
  return Buffer.from(JSON.stringify({ formatVersion: 1, files }) + '\n')
}

function copyVerified(source, destination, expectedSha256) {
  assert.equal(sha256(source), expectedSha256, 'Input source changed before copying')
  assertNoLinks(destination)
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
  assert.equal(sha256(destination), expectedSha256, 'Copied input hash mismatch')
}

export async function prepareInstallerAcceptance() {
  assertHostedRunner()
  assert.equal(process.versions.node, NODE_VERSION, 'Use the pinned Node runtime')
  const packageRoot = path.resolve(import.meta.dirname, '../..')
  const repositoryRoot = path.dirname(packageRoot)
  assert.ok(samePath(process.cwd(), packageRoot), 'Run preparation from the package directory')
  assertNoLinks(packageRoot)
  assertClean(repositoryRoot)
  const sourceSha = run('git', ['rev-parse', 'HEAD'], repositoryRoot).trim()
  assert.equal(sourceSha, process.env.GITHUB_SHA, 'Checkout differs from the current workflow SHA')
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'algo-electron')
  assert.equal(pkg.version, VERSION)
  const profile = path.join(process.env.APPDATA, 'algo-electron')
  const installation = path.join(process.env.LOCALAPPDATA, 'Programs', 'AlgoLearningPlatform')
  for (const target of [profile, installation]) {
    assertNoLinks(target)
    assert.equal(
      fs.existsSync(target),
      false,
      'Installer acceptance requires a fresh default profile and installation',
    )
  }
  const runnerTemp = process.env.RUNNER_TEMP
  const githubOutput = process.env.GITHUB_OUTPUT ?? ''
  assertChild(githubOutput, runnerTemp)
  assert.ok(fs.statSync(githubOutput).isFile(), 'Missing GitHub output file')
  const sourceBytes = sourceSnapshot(repositoryRoot)
  const sourceTreeSha256 = createHash('sha256').update(sourceBytes).digest('hex')
  const assets = await validateAssets(
    packageRoot,
    { version: VERSION },
    async (command, args, options = {}) => {
      assert.equal(command, 'powershell.exe', 'Unexpected asset inspection command')
      return run(command, args, packageRoot, options.env)
    },
  )
  const runDirectory = fs.mkdtempSync(path.join(runnerTemp, 'algo-installer-'))
  assertChild(runDirectory, runnerTemp)
  const inputDirectory = path.join(runDirectory, 'input')
  const outputDirectory = path.join(runDirectory, 'output')
  fs.mkdirSync(inputDirectory)
  fs.mkdirSync(outputDirectory)
  const baseline = path.join(inputDirectory, BASELINE_NAME)
  run(
    'gh',
    [
      'release',
      'download',
      'v2.0.0',
      '--repo',
      REPOSITORY,
      '--pattern',
      BASELINE_NAME,
      '--dir',
      inputDirectory,
    ],
    packageRoot,
  )
  assert.equal(fs.statSync(baseline).size, BASELINE_SIZE, 'Published baseline size mismatch')
  assert.equal(sha256(baseline), BASELINE_SHA256, 'Published baseline hash mismatch')
  const installer = assets.assets[0]
  const candidate = path.join(packageRoot, 'release', VERSION, installer.name)
  const guestScript = path.join(import.meta.dirname, 'sandbox-upgrade-guest.ps1')
  const fixtureHelper = path.join(import.meta.dirname, 'sandbox-upgrade-data.mjs')
  const guestScriptSha256 = sha256(guestScript)
  const fixtureHelperSha256 = sha256(fixtureHelper)
  const nodeSha256 = sha256(process.execPath)
  copyVerified(candidate, path.join(inputDirectory, installer.name), installer.sha256)
  copyVerified(process.execPath, path.join(inputDirectory, 'node.exe'), nodeSha256)
  copyVerified(
    guestScript,
    path.join(inputDirectory, 'sandbox-upgrade-guest.ps1'),
    guestScriptSha256,
  )
  copyVerified(
    fixtureHelper,
    path.join(inputDirectory, 'sandbox-upgrade-data.mjs'),
    fixtureHelperSha256,
  )
  const manifest = {
    formatVersion: 1,
    sourceSha,
    sourceTreeSha256,
    sourceDirty: false,
    candidateSize: installer.size,
    candidateSha256: installer.sha256,
    candidateAsarSha256: assets.asarSha256,
    nodeSha256,
    guestScriptSha256,
    fixtureHelperSha256,
  }
  fs.writeFileSync(
    path.join(inputDirectory, 'input-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    { flag: 'wx' },
  )
  assert.equal(fs.readdirSync(inputDirectory).length, 6, 'Unexpected acceptance input')
  assertClean(repositoryRoot)
  assert.equal(
    run('git', ['rev-parse', 'HEAD'], repositoryRoot).trim(),
    sourceSha,
    'Checkout changed during preparation',
  )
  assert.deepEqual(
    sourceSnapshot(repositoryRoot),
    sourceBytes,
    'Source bytes changed during preparation',
  )
  fs.writeFileSync(path.join(runDirectory, 'source-snapshot.json'), sourceBytes, { flag: 'wx' })
  const evidence = {
    formatVersion: 1,
    kind: 'github-hosted-installer-inputs-not-publication-acceptance',
    status: 'prepared',
    sourceSha,
    sourceTreeSha256,
    sourceDirty: false,
    environment: 'GitHubActions',
    github: {
      repository: process.env.GITHUB_REPOSITORY,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      sha: process.env.GITHUB_SHA,
    },
    baseline: { name: BASELINE_NAME, size: BASELINE_SIZE, sha256: BASELINE_SHA256 },
    ...assets,
    nodeVersion: process.versions.node,
    inputManifestSha256: sha256(path.join(inputDirectory, 'input-manifest.json')),
    preparedAt: new Date().toISOString(),
    scope:
      'Verified inputs for actual NSIS lifecycle with synthetic data. This is not a passed installer result, final-master acceptance, or authorization to publish.',
  }
  fs.writeFileSync(
    path.join(runDirectory, 'engineering-build.json'),
    JSON.stringify(evidence, null, 2) + '\n',
    { flag: 'wx' },
  )
  for (const [key, value] of Object.entries({ inputDirectory, outputDirectory, runDirectory })) {
    assert.equal(/[\r\n]/.test(value), false, 'Invalid GitHub output path')
    fs.appendFileSync(githubOutput, key + '=' + value + '\n')
  }
  process.stdout.write(
    'Verified six installer inputs for ' + sourceSha + '; run the isolated lifecycle next.\n',
  )
}

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  prepareInstallerAcceptance().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n')
    process.exitCode = 1
  })
}
