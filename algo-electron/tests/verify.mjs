import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Composite verification only: Vitest and Playwright remain the actual test runners.

const projectRoot = process.cwd()
const tmpDir = path.join(projectRoot, 'tmp', 'electron-tests')
const esbuildBin = path.join(projectRoot, 'node_modules', 'esbuild', 'bin', 'esbuild')
const eslintBin = path.join(projectRoot, 'node_modules', 'eslint', 'bin', 'eslint.js')
const tscBin = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')
const vitestBin = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs')
const electronBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron')

const suites = new Set(['core', 'ai', 'db', 'electron', 'coach', 'all'])

const coreVitestFiles = [
  'tests/ai/recommendationRules.test.ts',
  'tests/app',
  'tests/browser',
  'tests/coach',
  'tests/components',
  'tests/downloads',
  'tests/integration',
  'tests/ipc',
  'tests/parsers',
  'tests/scripts',
  'tests/security/trustedSender.test.ts',
  'tests/windows',
]

const dbVitestFiles = [
  'tests/db/codeforcesSubmissionIdMigration.test.ts',
  'tests/db/credentialExport.test.ts',
  'tests/db/credentialRepository.test.ts',
  'tests/db/databaseInitialization.test.ts',
  'tests/db/migrateLogging.test.ts',
  'tests/db/omniboxSuggestions.test.ts',
  'tests/db/problemContextMigration.test.ts',
  'tests/db/sqliteMigrationBackup.test.ts',
  'tests/db/siteCredentialMigration.test.ts',
  'tests/db/siteLoginAutofillMigration.test.ts',
  'tests/db/statsDate.test.ts',
  'tests/db/userScriptRuntimeMigration.test.ts',
  'tests/db/userScriptRuntimeRepository.test.ts',
  'tests/tracking/orphanProblemVisits.test.ts',
]

function run(command, args, env = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Command failed with status ${result.status}: ${command}`)
  }
}

function bundleTest(testFile, outputName, externals = []) {
  fs.mkdirSync(tmpDir, { recursive: true })
  const outfile = path.join(tmpDir, `${outputName}.mjs`)
  run(process.execPath, [
    esbuildBin,
    testFile,
    '--bundle',
    '--platform=node',
    '--format=esm',
    ...externals.map((external) => `--external:${external}`),
    `--outfile=${outfile}`,
  ])
  return outfile
}

function runElectronNodeTest(testFile, outputName) {
  const outfile = bundleTest(testFile, outputName, ['better-sqlite3', 'electron'])
  run(electronBin, [outfile], { ELECTRON_RUN_AS_NODE: '1' })
}

function runElectronAppTest(testFile, outputName) {
  const outfile = bundleTest(testFile, outputName, ['electron'])
  run(electronBin, [outfile])
}

function bundleElectronPreload(testFile, outputName) {
  const outfile = path.join(tmpDir, `${outputName}.cjs`)
  fs.mkdirSync(tmpDir, { recursive: true })
  run(process.execPath, [
    esbuildBin,
    testFile,
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--external:electron',
    `--outfile=${outfile}`,
  ])
  return outfile
}

function runVitest(files = [], coverage = false) {
  run(process.execPath, [vitestBin, 'run', ...(coverage ? ['--coverage'] : []), ...files])
}

function runTypecheck() {
  run(process.execPath, [tscBin, '--noEmit'])
}

function runLint() {
  run(process.execPath, [eslintBin, '.', '--report-unused-disable-directives', '--max-warnings', '0'])
}

function runArchitecture() {
  run(process.execPath, [path.join('tests', 'architecture', 'check-architecture.mjs')])
}

function runSecurity() {
  run(process.execPath, [path.join('tests', 'security', 'check-sensitive-files.mjs')])
}

function runDocs() {
  run(process.execPath, [path.join('tests', 'docs', 'check-docs.mjs')])
}

function runPackaging() {
  run(process.execPath, [path.join('tests', 'packaging', 'check-packaging.mjs')])
}

function runPerformance() {
  run(process.execPath, [path.join('tests', 'performance', 'checkRendererBundle.mjs')])
}

function runAiElectronTests() {
  runElectronNodeTest(path.join('tests', 'ai', 'traceability.test.ts'), 'ai-traceability')
}

function runDbElectronTests() {
  runElectronNodeTest(path.join('tests', 'db', 'backupImport.test.ts'), 'db-backupImport')
  runElectronNodeTest(path.join('tests', 'db', 'migrationSafety.test.ts'), 'db-migrationSafety')
  runElectronNodeTest(path.join('tests', 'db', 'dailyStatsPerformance.test.ts'), 'db-dailyStatsPerformance')
  runElectronNodeTest(path.join('tests', 'db', 'repositories.test.ts'), 'db-repositories')
}

function runCoachElectronTests() {
  runElectronAppTest(path.join('tests', 'coach', 'llmConfigStore.test.ts'), 'coach-llmConfigStore')
}

function runStartupSmoke() {
  const outfile = bundleTest(path.join('tests', 'electron', 'startupSmoke.test.ts'), 'electron-startupSmoke')
  run(process.execPath, [outfile])
}

function runUserScriptRuntimeSmoke() {
  const userscriptPreload = bundleElectronPreload(
    path.join('electron', 'scripts', 'userscriptBootstrapPreload.ts'),
    'userscript-runtime-preload',
  )
  const ordinaryPreload = bundleElectronPreload(
    path.join('tests', 'electron', 'fixtures', 'userScriptRuntimeOrdinaryPreload.ts'),
    'userscript-runtime-ordinary-preload',
  )
  const outfile = bundleTest(
    path.join('tests', 'electron', 'userScriptRuntimeSmoke.test.ts'),
    'electron-userscript-runtime-smoke',
    ['electron'],
  )
  run(electronBin, [outfile], {
    ALGO_USERSCRIPT_SMOKE_PRELOAD: userscriptPreload,
    ALGO_USERSCRIPT_SMOKE_ORDINARY_PRELOAD: ordinaryPreload,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  })
}

function runUiTests() {
  run(process.execPath, [path.join('tests', 'ui', 'runPlaywright.mjs')])
}

function runCoreSuite() {
  runTypecheck()
  runLint()
  runArchitecture()
  runSecurity()
  runVitest(coreVitestFiles)
}

function runAiSuite() {
  runVitest(['tests/ai/recommendationRules.test.ts'])
  runAiElectronTests()
}

function runDbSuite() {
  runVitest(dbVitestFiles)
  runDbElectronTests()
}

function runCoachSuite() {
  runVitest(['tests/coach'])
  runCoachElectronTests()
}

function runAllSuite() {
  runTypecheck()
  runLint()
  runArchitecture()
  runSecurity()
  runVitest([], true)
  runAiElectronTests()
  runDbElectronTests()
  runCoachElectronTests()
  runDocs()
  runPackaging()
  runPerformance()
  runStartupSmoke()
  runUserScriptRuntimeSmoke()
  runUiTests()
}

function runSuite(suite) {
  switch (suite) {
    case 'core':
      runCoreSuite()
      break
    case 'ai':
      runAiSuite()
      break
    case 'db':
      runDbSuite()
      break
    case 'electron':
      runStartupSmoke()
      runUserScriptRuntimeSmoke()
      break
    case 'coach':
      runCoachSuite()
      break
    case 'all':
      runAllSuite()
      break
  }
}

const requestedSuite = process.argv[2] ?? 'core'
if (!suites.has(requestedSuite)) {
  console.error(`Unknown verification suite: ${requestedSuite}`)
  console.error(`Available suites: ${Array.from(suites).join(', ')}`)
  process.exitCode = 1
} else {
  try {
    runSuite(requestedSuite)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
