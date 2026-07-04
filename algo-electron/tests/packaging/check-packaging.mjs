import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const builderConfigPath = path.join(projectRoot, 'electron-builder.json5')
const packageJsonPath = path.join(projectRoot, 'package.json')

function readJson5Like(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
  return JSON.parse(source)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function includesAll(values, expectedValues, fieldName) {
  for (const expected of expectedValues) {
    assert(values.includes(expected), `${fieldName} must include ${expected}`)
  }
}

const checks = []
function check(name, fn) {
  checks.push({ name, fn })
}

const builderConfig = readJson5Like(builderConfigPath)
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const files = builderConfig.files ?? []
const asarUnpack = builderConfig.asarUnpack ?? []

check('electron-builder uses explicit packaged entrypoints', () => {
  assert(builderConfig.asar === true, 'asar must stay enabled')
  assert(builderConfig.extraMetadata?.main === 'dist-electron/main.js', 'extraMetadata.main must point to dist-electron/main.js')
  assert(builderConfig.directories?.buildResources === 'build', 'buildResources must stay build')
  assert(builderConfig.directories?.output === 'release/${version}', 'output must stay release/${version}')

  includesAll(files, ['dist/**', 'dist-electron/**', 'package.json'], 'files')
  assert(!files.some((entry) => entry === '**/*' || entry === './**/*'), 'files must not use broad repository include patterns')
})

check('electron-builder excludes development and sensitive inputs', () => {
  includesAll(files, [
    '!**/*.log',
    '!**/*.local',
    '!**/*.db',
    '!**/*.sqlite',
    '!**/*.sqlite3',
    '!**/.env',
    '!**/.env.*',
    '!tmp/**',
    '!tests/**',
    '!release/**',
  ], 'files')
})

check('native SQLite module stays unpacked from asar', () => {
  includesAll(asarUnpack, [
    'node_modules/better-sqlite3/build/Release/*.node',
    'node_modules/better-sqlite3/bin/**/*.node',
  ], 'asarUnpack')
})

check('Windows build target remains NSIS x64 with app icon', () => {
  assert(builderConfig.win?.icon === 'build/icon.ico', 'Windows icon must use build/icon.ico')
  const target = builderConfig.win?.target?.[0]
  assert(target?.target === 'nsis', 'Windows target must be nsis')
  assert(Array.isArray(target?.arch) && target.arch.includes('x64'), 'Windows target must include x64')
  assert(builderConfig.win?.artifactName === '${productName}-Windows-${version}-${arch}-Setup.${ext}', 'Windows artifactName must include product/version/arch')
})

check('NSIS settings keep user data on uninstall', () => {
  assert(builderConfig.nsis?.oneClick === false, 'NSIS oneClick must stay false')
  assert(builderConfig.nsis?.perMachine === false, 'NSIS perMachine must stay false')
  assert(builderConfig.nsis?.allowToChangeInstallationDirectory === true, 'NSIS should allow changing install directory')
  assert(builderConfig.nsis?.deleteAppDataOnUninstall === false, 'NSIS must not delete user data on uninstall')
})

check('package scripts expose standard build commands', () => {
  assert(packageJson.main === 'dist-electron/main.js', 'package main must point to dist-electron/main.js')
  assert(packageJson.scripts?.build === 'tsc && vite build && electron-builder', 'build script must run tsc, vite build and electron-builder')
  assert(packageJson.scripts?.['build:win'] === 'tsc && vite build && electron-builder --win nsis', 'build:win script must build Windows NSIS package')
})

let failed = 0
console.log('Running packaging configuration checks...\n')
for (const item of checks) {
  try {
    item.fn()
    console.log(`[PASS] ${item.name}`)
  } catch (error) {
    failed++
    console.error(`[FAIL] ${item.name}`)
    console.error(error?.stack || error)
  }
}

console.log(`\nChecks finished. Failed: ${failed}/${checks.length}`)
if (failed > 0) {
  process.exit(1)
}
