import fs from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'

const projectRoot = process.cwd()
const builderConfigPath = path.join(projectRoot, 'electron-builder.json5')
const packageJsonPath = path.join(projectRoot, 'package.json')

// electron-builder.json5 是真正的 JSON5（注释、单引号、裸键）。prettier 全仓格式化
// （0.5，commit 601e3ea）把它重排成单引号 + 裸键后，"剥 // 注释再 JSON.parse" 的
// 手写近似解析直接炸掉 CI（run 40430001623）。配置文件声明成 .json5，就用 JSON5
// 解析器读，不再对文件风格做任何假设。
function readBuilderConfig(filePath) {
  return JSON5.parse(fs.readFileSync(filePath, 'utf8'))
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

const builderConfig = readBuilderConfig(builderConfigPath)
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const releaseDefault = JSON.parse(
  fs.readFileSync(path.join(projectRoot, '.release-it.json'), 'utf8'),
)
const releasePrepare = JSON.parse(
  fs.readFileSync(path.join(projectRoot, '.release-it.prepare.json'), 'utf8'),
)
const releasePublish = JSON.parse(
  fs.readFileSync(path.join(projectRoot, '.release-it.publish.json'), 'utf8'),
)
const files = builderConfig.files ?? []
const asarUnpack = builderConfig.asarUnpack ?? []
const electronFuses = builderConfig.electronFuses ?? {}

check('electron-builder uses explicit packaged entrypoints', () => {
  assert(builderConfig.asar === true, 'asar must stay enabled')
  assert(
    builderConfig.extraMetadata?.main === 'dist-electron/main.js',
    'extraMetadata.main must point to dist-electron/main.js',
  )
  assert(builderConfig.directories?.buildResources === 'build', 'buildResources must stay build')
  assert(
    builderConfig.directories?.output === 'release/${version}',
    'output must stay release/${version}',
  )

  includesAll(files, ['dist/**', 'dist-electron/**', 'package.json'], 'files')
  assert(
    !files.some((entry) => entry === '**/*' || entry === './**/*'),
    'files must not use broad repository include patterns',
  )
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
  includesAll(
    files,
    [
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
    ],
    'files',
  )
})

check('native SQLite module stays unpacked from asar', () => {
  includesAll(
    asarUnpack,
    [
      'node_modules/better-sqlite3/prebuilds/*.node',
      'node_modules/better-sqlite3/build/Release/*.node',
      'node_modules/better-sqlite3/bin/**/*.node',
    ],
    'asarUnpack',
  )
})

check('Windows build target remains NSIS x64 with app icon', () => {
  assert(builderConfig.win?.icon === 'build/icon.ico', 'Windows icon must use build/icon.ico')
  const target = builderConfig.win?.target?.[0]
  assert(target?.target === 'nsis', 'Windows target must be nsis')
  assert(
    Array.isArray(target?.arch) && target.arch.includes('x64'),
    'Windows target must include x64',
  )
  assert(
    builderConfig.win?.artifactName === '${productName}-Windows-${version}-${arch}-Setup.${ext}',
    'Windows artifactName must include product/version/arch',
  )
})

check('NSIS settings keep user data on uninstall', () => {
  assert(builderConfig.nsis?.oneClick === false, 'NSIS oneClick must stay false')
  assert(builderConfig.nsis?.perMachine === false, 'NSIS perMachine must stay false')
  assert(
    builderConfig.nsis?.allowToChangeInstallationDirectory === true,
    'NSIS should allow changing install directory',
  )
  assert(
    builderConfig.nsis?.deleteAppDataOnUninstall === false,
    'NSIS must not delete user data on uninstall',
  )
})

check('package scripts expose standard build commands', () => {
  assert(
    packageJson.main === 'dist-electron/main.js',
    'package main must point to dist-electron/main.js',
  )

  // 只断言"先装 Electron 二进制、再重建 native 依赖"的顺序，不钉死包管理器与嵌套写法：
  // 阶段 0 把 postinstall 内联为两个可执行命令（pnpm 生命周期里嵌套调用 pnpm 会撞
  // packageManager 版本门），顺序本身才是契约。
  const postinstall = packageJson.scripts?.postinstall ?? ''
  const electronStep = postinstall.indexOf('install-electron')
  const rebuildStep = postinstall.indexOf('electron-builder install-app-deps')
  assert(electronStep !== -1, 'postinstall must install the Electron binary')
  assert(rebuildStep !== -1, 'postinstall must rebuild native dependencies')
  assert(
    electronStep < rebuildStep,
    'postinstall must install the Electron binary before rebuilding native dependencies',
  )

  assert(
    packageJson.scripts?.['install:electron'] === 'install-electron --no',
    'install:electron must explicitly download the Electron binary',
  )
  assert(
    packageJson.scripts?.['install:app-deps'] === 'electron-builder install-app-deps',
    'install:app-deps must expose the native dependency rebuild command',
  )
  assert(
    packageJson.scripts?.['test:packaged-main'] === 'node tests/packaging/checkPackagedMain.mjs',
    'test:packaged-main must verify native modules stay external',
  )
  assert(
    packageJson.scripts?.['test:packaged-app'] === 'node tests/packaging/checkPackagedApp.mjs',
    'test:packaged-app must smoke test the unpacked application',
  )

  const build = packageJson.scripts?.build ?? ''
  assert(
    build.startsWith('tsc && vite build') &&
      build.includes('test:packaged-main') &&
      build.endsWith('electron-builder --publish never'),
    'build script must verify the main bundle before electron-builder',
  )

  const buildWin = packageJson.scripts?.['build:win'] ?? ''
  assert(
    buildWin.includes('test:packaged-main') &&
      buildWin.includes('--win nsis --publish never') &&
      buildWin.includes('test:packaged-app'),
    'build:win script must verify the main bundle and smoke test Windows output',
  )
  assert(
    buildWin.indexOf('test:packaged-main') < buildWin.indexOf('electron-builder'),
    'build:win must verify the main bundle before electron-builder',
  )
})

check('build metadata has a provider without implicit uploads or updater claims', () => {
  assert(
    builderConfig.publish?.provider === 'github',
    'Update metadata requires an explicit GitHub provider',
  )
  assert(builderConfig.publish.owner === 'xuoer-xuper', 'Unexpected publication owner')
  assert(
    builderConfig.publish.repo === 'Algo-Learning-Platform',
    'Unexpected publication repository',
  )
  assert(builderConfig.publish.publishAutoUpdate !== false, 'Do not suppress latest.yml generation')
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    if (command.includes('electron-builder') && !command.includes('install-app-deps')) {
      assert(command.includes('--publish never'), `${name} must not upload during a build`)
    }
  }
})

check('release preparation is PR-only with the actual shipped changelog baseline', () => {
  assert(
    JSON.stringify(releasePrepare.git.requireBranch) === JSON.stringify(['!master', '!dev']),
    'Prepare only on a PR branch',
  )
  assert(
    releasePrepare.npm.publish === false && releasePrepare.npm.allowSameVersion === true,
    'Preparation must not npm-publish',
  )
  for (const field of ['commit', 'tag', 'push'])
    assert(releasePrepare.git[field] === false, `Preparation git.${field} must be false`)
  assert(releasePrepare.github.release === false, 'Preparation must not create a release')
  const plugin = releasePrepare.plugins['@release-it/conventional-changelog']
  assert(
    plugin.context.previousTag === 'v2.0.0' && plugin.gitRawCommitsOpts.from === 'v2.0.0',
    'Do not infer release notes from an obsolete RC',
  )
  assert(
    releasePrepare.hooks['before:init'] === 'node scripts/release-cli.mjs guard-prepare',
    'Preparation requires fail-closed branch/remote checks',
  )
})

check('publication never bumps, commits, regenerates changelog or bypasses hooks', () => {
  assert(releasePublish.increment === false, 'Publication must not bump')
  assert(
    releasePublish.npm?.publish === false && releasePublish.npm.ignoreVersion !== true,
    'Keep npm package version discovery enabled',
  )
  assert(
    releasePublish.git.commit === false && releasePublish.git.changelog === false,
    'Publication must be source-read-only',
  )
  assert(releasePublish.git.requireBranch === 'master', 'Only accepted master can be tagged')
  assert(
    releasePublish.git.tagName === 'v${version}' &&
      releasePublish.git.tagAnnotation === 'v${version}',
    'Publication requires an annotated version tag',
  )
  assert(
    !releasePublish.plugins && !releasePublish.extends,
    'Publishing config must not inherit changelog plugins',
  )
  assert(
    releasePublish.git.push === false && releasePublish.github.release === false,
    'Guarded wrapper exclusively owns exact tag push and draft publication',
  )
  assert(
    releasePublish.hooks['before:git:release'] === 'node scripts/release-cli.mjs guard-tag',
    'Recheck before local tag side effect',
  )
  for (const config of [releaseDefault, releasePrepare, releasePublish]) {
    assert(!JSON.stringify(config).includes('--no-verify'), 'Normal Git hooks must remain active')
    assert(!JSON.stringify(config).includes('HUSKY='), 'Do not bypass Husky')
  }
  assert(
    releaseDefault.increment === false &&
      releaseDefault.git.tag === false &&
      releaseDefault.git.push === false,
    'Default config must be inert',
  )
  assert(
    packageJson.scripts.release === 'node scripts/release-cli.mjs help',
    'Default release must require an explicit stage',
  )
  for (const stage of ['prepare', 'build', 'check', 'draft', 'verify', 'publish']) {
    assert(
      packageJson.scripts[`release:${stage}`] === `node scripts/release-cli.mjs ${stage}`,
      `Missing guarded ${stage} command`,
    )
  }
})

check('pnpm settings keep the flat layout and allow dependency build scripts', () => {
  // pnpm 12 只从 pnpm-workspace.yaml 读项目设置：nodeLinker=hoisted 是 Electron 打包与
  // better-sqlite3 解析的前提；allowBuilds 缺少条目会让 pnpm 直接以 ERR_PNPM_IGNORED_BUILDS
  // 失败（不是警告），所以这条配置必须有守卫，否则下次升级依赖时会以"安装失败"的形式才暴露。
  const workspaceSettings = fs.readFileSync(path.join(projectRoot, 'pnpm-workspace.yaml'), 'utf8')
  assert(
    /^nodeLinker:\s*hoisted$/m.test(workspaceSettings),
    'pnpm-workspace.yaml must keep nodeLinker: hoisted',
  )
  assert(
    /^shamefullyHoist:\s*true$/m.test(workspaceSettings),
    'pnpm-workspace.yaml must keep shamefullyHoist: true',
  )
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
