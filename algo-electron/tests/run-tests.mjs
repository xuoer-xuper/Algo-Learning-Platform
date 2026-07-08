import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const tmpDir = path.join(projectRoot, 'tmp')
const esbuildBin = path.join(projectRoot, 'node_modules', 'esbuild', 'bin', 'esbuild')
const eslintBin = path.join(projectRoot, 'node_modules', 'eslint', 'bin', 'eslint.js')
const electronBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron')

const suites = new Set([
  'core',
  'ai',
  'architecture',
  'security',
  'adapters',
  'submissions',
  'db',
  'docs',
  'packaging',
  'electron',
  'ui',
  'coach',
  'all',
])

function run(command, args, env = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`)

  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error)
    }
    process.exit(result.status ?? 1)
  }
}

function bundleTest(testFile, outfile, externals = []) {
  fs.mkdirSync(path.dirname(outfile), { recursive: true })

  run(process.execPath, [
    esbuildBin,
    testFile,
    '--bundle',
    '--platform=node',
    '--format=esm',
    ...externals.map((external) => `--external:${external}`),
    `--outfile=${outfile}`,
  ])
}

function bundleAndRun(testFile, prefix, externals = []) {
  const baseName = path.basename(testFile, '.test.ts')
  const outfile = path.join(tmpDir, `${prefix}-${baseName}.test.mjs`)

  bundleTest(testFile, outfile, externals)
  run(process.execPath, [outfile])
}

function bundleAndRunDirectory(dir, prefix) {
  const testDir = path.join(projectRoot, 'tests', dir)
  const testFiles = fs
    .readdirSync(testDir)
    .filter((file) => file.endsWith('.test.ts'))
    .sort()

  for (const file of testFiles) {
    bundleAndRun(path.join('tests', dir, file), prefix)
  }
}

function runTypecheck() {
  run(process.execPath, [path.join('node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'])
}

function runLint() {
  run(process.execPath, [
    eslintBin,
    '.',
    '--ext',
    'ts,tsx',
    '--report-unused-disable-directives',
    '--max-warnings',
    '0',
  ])
}

function runDbSuite() {
  const backupImportBundle = path.join(tmpDir, 'db-backupImport.test.mjs')
  bundleTest(
    path.join('tests', 'db', 'backupImport.test.ts'),
    backupImportBundle,
    ['better-sqlite3', 'electron'],
  )
  run(electronBin, [backupImportBundle], { ELECTRON_RUN_AS_NODE: '1' })

  bundleAndRun(path.join('tests', 'db', 'codeforcesSubmissionIdMigration.test.ts'), 'db')
  bundleAndRun(path.join('tests', 'db', 'problemContextMigration.test.ts'), 'db')

  const repositoryBundle = path.join(tmpDir, 'db-repositories.test.mjs')
  bundleTest(
    path.join('tests', 'db', 'repositories.test.ts'),
    repositoryBundle,
    ['better-sqlite3', 'electron'],
  )
  run(electronBin, [repositoryBundle], { ELECTRON_RUN_AS_NODE: '1' })
}

function runDocsSuite() {
  run(process.execPath, [path.join('tests', 'docs', 'check-docs.mjs')])
}

function runArchitectureSuite() {
  run(process.execPath, [path.join('tests', 'architecture', 'check-architecture.mjs')])
}

function runSecuritySuite() {
  run(process.execPath, [path.join('tests', 'security', 'check-sensitive-files.mjs')])
}

function runPackagingSuite() {
  run(process.execPath, [path.join('tests', 'packaging', 'check-packaging.mjs')])
}

function runCoreSuite() {
  runTypecheck()
  runLint()
  runArchitectureSuite()
  runSecuritySuite()
  bundleAndRun(path.join('tests', 'ipc', 'ipcContracts.test.ts'), 'ipc')
  bundleAndRun(path.join('tests', 'ai', 'recommendationRules.test.ts'), 'ai')
  bundleAndRun(path.join('tests', 'scripts', 'userScriptMetadata.test.ts'), 'scripts')
  bundleAndRunDirectory('browser', 'browser')
  bundleAndRunDirectory('parsers', 'parsers')
  bundleAndRunDirectory('integration', 'integration')
  bundleAndRunDirectory('coach', 'coach')
}

function runAiSuite() {
  bundleAndRun(path.join('tests', 'ai', 'recommendationRules.test.ts'), 'ai')

  const traceabilityBundle = path.join(tmpDir, 'ai-traceability.test.mjs')
  bundleTest(
    path.join('tests', 'ai', 'traceability.test.ts'),
    traceabilityBundle,
    ['better-sqlite3', 'electron'],
  )
  run(electronBin, [traceabilityBundle], { ELECTRON_RUN_AS_NODE: '1' })
}

function runSuite(suite) {
  switch (suite) {
    case 'core':
      runCoreSuite()
      break
    case 'ai':
      runAiSuite()
      break
    case 'architecture':
      runArchitectureSuite()
      break
    case 'security':
      runSecuritySuite()
      break
    case 'adapters':
      bundleAndRunDirectory('adapters', 'adapters')
      break
    case 'submissions':
      bundleAndRunDirectory('submissions', 'submissions')
      break
    case 'db':
      runDbSuite()
      break
    case 'docs':
      runDocsSuite()
      break
    case 'packaging':
      runPackagingSuite()
      break
    case 'electron':
      bundleAndRun(path.join('tests', 'electron', 'startupSmoke.test.ts'), 'electron')
      break
    case 'ui':
      bundleAndRun(path.join('tests', 'ui', 'rendererScreenshots.test.ts'), 'ui')
      break
    case 'coach':
      bundleAndRunDirectory('coach', 'coach')
      break
    case 'all':
      runCoreSuite()
      runAiSuite()
      bundleAndRunDirectory('adapters', 'adapters')
      bundleAndRunDirectory('submissions', 'submissions')
      runDbSuite()
      runDocsSuite()
      runPackagingSuite()
      bundleAndRun(path.join('tests', 'electron', 'startupSmoke.test.ts'), 'electron')
      bundleAndRun(path.join('tests', 'ui', 'rendererScreenshots.test.ts'), 'ui')
      bundleAndRunDirectory('coach', 'coach')
      break
  }
}

const requestedSuite = process.argv[2] ?? 'core'

if (!suites.has(requestedSuite)) {
  console.error(`Unknown test suite: ${requestedSuite}`)
  console.error(`Available suites: ${Array.from(suites).join(', ')}`)
  process.exit(1)
}

runSuite(requestedSuite)
