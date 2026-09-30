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
const electronFuses = builderConfig.electronFuses ?? {}

check('electron-builder uses explicit packaged entrypoints', () => {
  assert(builderConfig.asar === true, 'asar must stay enabled')
  assert(builderConfig.extraMetadata?.main === 'dist-electron/main.js', 'extraMetadata.main must point to dist-electron/main.js')
  assert(builderConfig.directories?.buildResources === 'build', 'buildResources must stay build')
  assert(builderConfig.directories?.output === 'release/${version}', 'output must stay release/${version}')

  includesAll(files, ['dist/**', 'dist-electron/**', 'package.json'], 'files')
  assert(!files.some((entry) => entry === '**/*' || entry === './**/*'), 'files must not use broad repository include patterns')
})

check('electron-builder enables the required production fuses', () => {
  const expected = {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  }
  for (const [name, value] of Object.entries(expected)) {
    assert(electronFuses[name] === value, `electronFuses.${name} must be ${String(value)}`)
  }
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
    'node_modules/better-sqlite3/prebuilds/*.node',
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

  // 只断言"先装 Electron 二进制、再重建 native 依赖"的顺序，不钉死包管理器与嵌套写法：
  // 阶段 0 把 postinstall 内联为两个可执行命令（pnpm 生命周期里嵌套调用 pnpm 会撞
  // packageManager 版本门），顺序本身才是契约。
  const postinstall = packageJson.scripts?.postinstall ?? ''
  const electronStep = postinstall.indexOf('install-electron')
  const rebuildStep = postinstall.indexOf('electron-builder install-app-deps')
  assert(electronStep !== -1, 'postinstall must install the Electron binary')
  assert(rebuildStep !== -1, 'postinstall must rebuild native dependencies')
  assert(electronStep < rebuildStep, 'postinstall must install the Electron binary before rebuilding native dependencies')

  assert(packageJson.scripts?.['install:electron'] === 'install-electron --no', 'install:electron must explicitly download the Electron binary')
  assert(packageJson.scripts?.['install:app-deps'] === 'electron-builder install-app-deps', 'install:app-deps must expose the native dependency rebuild command')
  assert(packageJson.scripts?.['test:packaged-main'] === 'node tests/packaging/checkPackagedMain.mjs', 'test:packaged-main must verify native modules stay external')
  assert(packageJson.scripts?.['test:packaged-app'] === 'node tests/packaging/checkPackagedApp.mjs', 'test:packaged-app must smoke test the unpacked application')

  const build = packageJson.scripts?.build ?? ''
  assert(
    build.startsWith('tsc && vite build') && build.includes('test:packaged-main') && build.endsWith('electron-builder'),
    'build script must verify the main bundle before electron-builder',
  )

  const buildWin = packageJson.scripts?.['build:win'] ?? ''
  assert(
    buildWin.includes('test:packaged-main') && buildWin.includes('--win nsis') && buildWin.includes('test:packaged-app'),
    'build:win script must verify the main bundle and smoke test Windows output',
  )
  assert(
    buildWin.indexOf('test:packaged-main') < buildWin.indexOf('electron-builder'),
    'build:win must verify the main bundle before electron-builder',
  )
})

check('pnpm settings keep the flat layout and allow dependency build scripts', () => {
  // pnpm 12 只从 pnpm-workspace.yaml 读项目设置：nodeLinker=hoisted 是 Electron 打包与
  // better-sqlite3 解析的前提；allowBuilds 缺少条目会让 pnpm 直接以 ERR_PNPM_IGNORED_BUILDS
  // 失败（不是警告），所以这条配置必须有守卫，否则下次升级依赖时会以"安装失败"的形式才暴露。
  const workspaceSettings = fs.readFileSync(path.join(projectRoot, 'pnpm-workspace.yaml'), 'utf8')
  assert(/^nodeLinker:\s*hoisted$/m.test(workspaceSettings), 'pnpm-workspace.yaml must keep nodeLinker: hoisted')
  assert(/^shamefullyHoist:\s*true$/m.test(workspaceSettings), 'pnpm-workspace.yaml must keep shamefullyHoist: true')
  for (const dependency of ['esbuild', 'electron-winstaller']) {
    assert(
      new RegExp(`^\\s{2}${dependency}:\\s*true$`, 'm').test(workspaceSettings),
      `pnpm-workspace.yaml must allow the ${dependency} build script`,
    )
  }
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
