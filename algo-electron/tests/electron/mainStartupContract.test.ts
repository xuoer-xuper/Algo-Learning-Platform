import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test, vi } from 'vitest'

/**
 * main.ts 是顶层启动脚本，没有导出的装配函数——这曾是 mainResilience.test.ts
 * 整篇用源码字符串断言的理由。实测不成立：它在 electron 替身下能直接 import，
 * 而 import 本身就是"启动一次"。只要在 import 之前换掉
 * `requestSingleInstanceLock` / `whenReady` / `getPath`，单实例闸门、协议注册、
 * IPC 注册、生命周期钩子、启动失败上报全都是可观察的。
 *
 * 关键前提：whenReady 必须挂住不 resolve。让它 resolve 会把整条链跑完——真开
 * 数据库、真建窗口、真写 userData——那是集成冒烟（tests/verify.mjs electron）的活。
 * 挂住之后闸门内的同步装配照常执行，正是要验的部分。
 *
 * 为什么值得这么绕：闸门守的是"抢锁失败的进程绝不能碰共享状态"。源码断言只能看到
 * 那几行文本还在 `if (hasSingleInstanceLock)` 之后，看不到它们真的没执行——把闸门
 * 条件写成恒真，那些断言一条都不会红。
 */

type ProcessErrorListener = (...args: unknown[]) => void

function isListener(value: unknown): value is ProcessErrorListener {
  return typeof value === 'function'
}

// 分支写开而不是把 event 直接传进去：process.listeners 的重载里有一支收 Signals，
// 联合类型会被解析到那一支上编译不过。
function errorListeners(event: 'uncaughtException' | 'unhandledRejection'): ProcessErrorListener[] {
  const listeners =
    event === 'uncaughtException'
      ? process.listeners('uncaughtException')
      : process.listeners('unhandledRejection')
  return listeners.filter(isListener)
}

// smoke 专用开关必须逐个存档还原：它们是模块级 const，import 时求值，
// 漏还原会让同文件后面的用例读到上一条用例注入的值。
const SMOKE_ENV_KEYS = [
  'ALGO_ELECTRON_SMOKE',
  'ALGO_ELECTRON_SMOKE_USER_DATA',
  'ALGO_ELECTRON_SMOKE_RENDERER_DIST',
  'ALGO_ELECTRON_SMOKE_OJ_PRELOAD_PATH',
  'ALGO_ELECTRON_SMOKE_USERSCRIPT_PRELOAD_PATH',
]

let tempDir = ''
let baselineUncaught: ProcessErrorListener[] = []
let baselineRejection: ProcessErrorListener[] = []
let savedEnv = new Map<string, string | undefined>()
let savedArgv: string[] = []

function setEnv(patch: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

interface StartedMain {
  mock: typeof import('./electronMock')
  main: typeof import('../../electron/main.ts')
  /** registerMainIpc 注册过的频道名。包装 handle 而不是事后调用，避免真跑生产处理器。 */
  ipcChannels: string[]
  whenReadyCalls: () => number
  logDirectory: string
}

interface StartOptions {
  granted?: boolean
  /** 默认挂住不 resolve；传 rejection 用来验启动失败上报。 */
  whenReady?: () => Promise<void>
}

async function startMain(options: StartOptions = {}): Promise<StartedMain> {
  vi.resetModules()
  // 必须先 resetModules 再 import 替身：main.ts 里的 `electron` 经 vitest.config
  // 的 alias 指向同一个文件，重置后两边拿到的才是同一个新实例。
  const mock = await import('./electronMock')
  mock.resetElectronMock()
  mock.app.singleInstanceLockGranted = options.granted ?? true
  mock.app.getPath = () => tempDir
  let whenReadyCalls = 0
  const suspended = options.whenReady ?? (() => new Promise<void>(() => {}))
  mock.app.whenReady = () => {
    whenReadyCalls += 1
    return suspended()
  }

  const ipcChannels: string[] = []
  const realHandle = mock.ipcMain.handle
  mock.ipcMain.handle = (channel, listener) => {
    ipcChannels.push(channel)
    realHandle(channel, listener)
  }

  const main = await import('../../electron/main.ts')
  return {
    mock,
    main,
    ipcChannels,
    whenReadyCalls: () => whenReadyCalls,
    logDirectory: path.join(tempDir, 'logs'),
  }
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-main-startup-'))
  baselineUncaught = errorListeners('uncaughtException')
  baselineRejection = errorListeners('unhandledRejection')
  savedEnv = new Map(SMOKE_ENV_KEYS.map((key) => [key, process.env[key]]))
  savedArgv = [...process.argv]
  setEnv(Object.fromEntries(SMOKE_ENV_KEYS.map((key) => [key, undefined])))
})

/*
 * main.ts 把 installMainProcessErrorHandlers 的反注册函数丢掉了（生产里进程活到退出，
 * 无所谓），于是每次 import 都往真实 process 上多挂一对监听。这里按差集摘掉：
 * 留着的话，前一条用例的 handler 会截走后一条用例故意制造的 rejection。
 */
afterEach(() => {
  vi.doUnmock('../../src/main/db/resolve-upgrade')
  for (const listener of errorListeners('uncaughtException')) {
    if (!baselineUncaught.includes(listener)) process.off('uncaughtException', listener)
  }
  for (const listener of errorListeners('unhandledRejection')) {
    if (!baselineRejection.includes(listener)) process.off('unhandledRejection', listener)
  }
  for (const [key, value] of savedEnv) setEnv({ [key]: value })
  process.argv = savedArgv
  fs.rmSync(tempDir, { recursive: true, force: true })
})

test('maintenance refuses a second instance explicitly without config, services, IPC or lifecycle startup', async () => {
  process.argv = [
    'AlgoLearningPlatform.exe',
    '--resolve-upgrade=12345678-1234-4123-8123-123456789abc',
    '--resolution=keep-current',
  ]
  const original = Buffer.from('{ "appearance": "legacy-original" }')
  fs.writeFileSync(path.join(tempDir, 'config.json'), original)
  const started = await startMain({ granted: false, whenReady: () => Promise.resolve() })
  assert.deepStrictEqual(started.mock.app.exitCodes, [2])
  assert.strictEqual(started.mock.app.quitCallCount, 0)
  assert.strictEqual(started.whenReadyCalls(), 0)
  assert.deepStrictEqual(started.ipcChannels, [])
  assert.strictEqual(started.mock.protocolSchemes.length, 0)
  assert.strictEqual(started.mock.app.listenerCount('before-quit'), 0)
  assert.strictEqual(started.mock.app.listenerCount('second-instance'), 0)
  assert.deepStrictEqual(fs.readFileSync(path.join(tempDir, 'config.json')), original)
  assert.strictEqual(fs.existsSync(path.join(tempDir, 'data')), false)
})

test('invalid maintenance flags exit without normal startup even after app readiness', async () => {
  process.argv = [
    'AlgoLearningPlatform.exe',
    '--resolve-upgrade=not-a-uuid',
    '--resolution=keep-current',
  ]
  const original = Buffer.from('{ "appearance": "legacy-original" }')
  fs.writeFileSync(path.join(tempDir, 'config.json'), original)
  const started = await startMain({ granted: true, whenReady: () => Promise.resolve() })
  await vi.waitFor(() => assert.deepStrictEqual(started.mock.app.exitCodes, [1]))
  assert.deepStrictEqual(started.ipcChannels, [])
  assert.strictEqual(started.mock.protocolSchemes.length, 0)
  assert.strictEqual(started.mock.app.listenerCount('before-quit'), 0)
  assert.strictEqual(started.mock.app.listenerCount('activate'), 0)
  assert.deepStrictEqual(fs.readFileSync(path.join(tempDir, 'config.json')), original)
  assert.strictEqual(fs.existsSync(path.join(tempDir, 'data')), false)
  assert.strictEqual(fs.existsSync(path.join(tempDir, 'userscripts')), false)
})

test('valid maintenance without a matching attempt fails closed before config/services/IPC', async () => {
  process.argv = [
    'AlgoLearningPlatform.exe',
    '--resolve-upgrade=12345678-1234-4123-8123-123456789abc',
    '--resolution=retry-source',
  ]
  const original = Buffer.from('{ "appearance": "legacy-original" }')
  fs.writeFileSync(path.join(tempDir, 'config.json'), original)
  const started = await startMain({ granted: true, whenReady: () => Promise.resolve() })
  await vi.waitFor(() => assert.deepStrictEqual(started.mock.app.exitCodes, [1]))
  assert.deepStrictEqual(started.ipcChannels, [])
  assert.strictEqual(started.mock.protocolSchemes.length, 0)
  assert.strictEqual(started.mock.app.listenerCount('before-quit'), 0)
  assert.deepStrictEqual(fs.readFileSync(path.join(tempDir, 'config.json')), original)
  assert.strictEqual(fs.existsSync(path.join(tempDir, 'data')), false)
})

test('successful maintenance resolves only the locked current profile and exits before ordinary startup', async () => {
  const request = {
    attemptId: '12345678-1234-4123-8123-123456789abc',
    resolution: 'keep-current',
  }
  process.argv = [
    'AlgoLearningPlatform.exe',
    `--resolve-upgrade=${request.attemptId}`,
    `--resolution=${request.resolution}`,
  ]
  const resolve = vi.fn(async (..._args: unknown[]) => 'Resolution verified')
  vi.doMock('../../src/main/db/resolve-upgrade', () => ({
    resolveUpgrade: resolve,
    inspectUpgradeRecovery: vi.fn(),
  }))
  const original = Buffer.from('{ "appearance": "legacy-original" }')
  fs.writeFileSync(path.join(tempDir, 'config.json'), original)
  const started = await startMain({ granted: true, whenReady: () => Promise.resolve() })
  await vi.waitFor(() => assert.deepStrictEqual(started.mock.app.exitCodes, [0]))
  assert.strictEqual(started.mock.app.requestSingleInstanceLockCallCount, 1)
  assert.deepStrictEqual(resolve.mock.calls, [[tempDir, request]])
  assert.deepStrictEqual(started.ipcChannels, [])
  assert.strictEqual(started.mock.protocolSchemes.length, 0)
  assert.strictEqual(started.mock.app.listenerCount('before-quit'), 0)
  assert.strictEqual(started.mock.app.listenerCount('activate'), 0)
  assert.deepStrictEqual(fs.readFileSync(path.join(tempDir, 'config.json')), original)
  assert.strictEqual(fs.existsSync(path.join(tempDir, 'data')), false)
})

for (const smoke of ['mode', 'profile']) {
  test(`maintenance rejects smoke ${smoke} redirection before calling the resolver`, async () => {
    process.argv = [
      'AlgoLearningPlatform.exe',
      '--resolve-upgrade=12345678-1234-4123-8123-123456789abc',
      '--resolution=keep-current',
    ]
    const resolve = vi.fn()
    vi.doMock('../../src/main/db/resolve-upgrade', () => ({
      resolveUpgrade: resolve,
      inspectUpgradeRecovery: vi.fn(),
    }))
    const redirected = path.join(tempDir, 'redirected')
    setEnv(
      smoke === 'mode'
        ? { ALGO_ELECTRON_SMOKE: '1' }
        : { ALGO_ELECTRON_SMOKE_USER_DATA: redirected },
    )
    const started = await startMain({ granted: true, whenReady: () => Promise.resolve() })
    await vi.waitFor(() => assert.deepStrictEqual(started.mock.app.exitCodes, [1]))
    assert.strictEqual(resolve.mock.calls.length, 0)
    assert.ok(started.mock.app.setPathCalls.every(([, value]) => value !== redirected))
    assert.deepStrictEqual(started.ipcChannels, [])
    assert.strictEqual(fs.existsSync(redirected), false)
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'data')), false)
  })
}

test('抢锁失败的进程直接退出，不碰日志、协议、IPC 与生命周期', async () => {
  const started = await startMain({ granted: false })

  assert.strictEqual(started.mock.app.quitCallCount, 1, '败者必须自己退出')
  assert.strictEqual(started.mock.app.requestSingleInstanceLockCallCount, 1)

  // 以下每一项都是"共享状态"：私有协议、IPC 频道、退出钩子。败者碰任何一项都会
  // 和赢者抢同一份 userData 或抢同一批频道。
  //
  // 日志目录是例外：自研 logger 把败者的单实例拒绝行缓存在内存里（永不落盘），
  // 换 electron-log 后写入即时落盘，败者会在共享 main.log 里留下
  // app.single-instance-denied——这是"用户双开过"的诊断线索，不是状态污染。
  // 真正要守的是闸门体没跑：main.log 不得出现闸门内的 app.launch 探针行。
  const loserLogDirectory = started.logDirectory
  // 目录必须存在：electron-log 对拒绝路径也是立即落盘，目录缺席说明日志管线坏了，
  // 静默跳过断言会让"拒绝记录持久化"无声退化（复核 2026-11-01 建议）。
  assert.ok(fs.existsSync(loserLogDirectory), '败者也必须产出日志目录（electron-log 立即写盘）')
  const loserLog = fs.readFileSync(path.join(loserLogDirectory, 'main.log'), 'utf8')
  assert.ok(loserLog.includes('[INFO] app.single-instance-denied'), '败者应留下单实例拒绝记录')
  assert.ok(!loserLog.includes('[INFO] app.launch'), '败者不得执行闸门内的启动装配')
  assert.strictEqual(started.mock.protocolSchemes.length, 0, '败者不得注册特权协议')
  assert.deepStrictEqual(started.ipcChannels, [], '败者不得注册 IPC 频道')
  assert.strictEqual(started.mock.app.listenerCount('window-all-closed'), 0)
  assert.strictEqual(
    started.mock.app.listenerCount('before-quit'),
    0,
    '败者挂 before-quit 会替赢者写会话',
  )
  assert.strictEqual(started.mock.app.listenerCount('activate'), 0)
  assert.strictEqual(started.mock.app.listenerCount('second-instance'), 0)

  // whenReady 一次都没调到，说明数据库、会话仓库、窗口创建整条 async 链根本没起步。
  // 那三项（initializeMainServices / TabSessionStore / ApplicationSessionStore）就在链里。
  assert.strictEqual(started.whenReadyCalls(), 0, '败者不得进入 whenReady 启动链')

  assert.strictEqual(
    errorListeners('uncaughtException').length,
    baselineUncaught.length,
    '败者不得接管进程级错误处理',
  )
})

test('拿到锁后才装配协议、IPC、生命周期与进程级错误处理', async () => {
  const started = await startMain({ granted: true })

  assert.strictEqual(started.mock.app.quitCallCount, 0)
  assert.strictEqual(fs.existsSync(started.logDirectory), true, '赢者初始化文件日志')
  assert.strictEqual(started.mock.protocolSchemes.length, 2, 'note 资产与 shell 两个特权协议')
  assert.strictEqual(started.mock.app.listenerCount('window-all-closed'), 1)
  assert.strictEqual(started.mock.app.listenerCount('before-quit'), 1)
  assert.strictEqual(started.mock.app.listenerCount('activate'), 1)
  assert.strictEqual(started.mock.app.listenerCount('second-instance'), 1, '后续启动要能唤回窗口')
  assert.strictEqual(started.whenReadyCalls(), 1)

  // 抽查三个不同注册器的频道，证明 registerMainIpc 整包真的跑了；断言总数会被
  // 任何一次增删频道弄红，那是噪声不是回归。
  for (const channel of [
    'credentials:list',
    'submissions:syncCodeforces',
    'backup:createDatabaseBackup',
  ]) {
    assert.ok(started.ipcChannels.includes(channel), `${channel} 应在闸门内注册`)
  }

  assert.strictEqual(
    errorListeners('uncaughtException').length,
    baselineUncaught.length + 1,
    'uncaughtException 必须挂到真实 process 上',
  )
  assert.strictEqual(
    errorListeners('unhandledRejection').length,
    baselineRejection.length + 1,
    'unhandledRejection 必须挂到真实 process 上',
  )
})

test('启动链失败按 startup 上报致命错误，而不是烂成 unhandledRejection', async () => {
  const started = await startMain({
    granted: true,
    whenReady: () => Promise.reject(new Error('startup-boom')),
  })

  await vi.waitFor(() => {
    assert.deepStrictEqual(started.mock.app.exitCodes, [1], '致命错误必须以退出码 1 收场')
  })

  // 承重断言在 source 上：少了那条 .catch，rejection 会落到进程级
  // unhandledRejection handler，一样 exit(1)、一样一个弹窗，只有日志里的 source
  // 会从 startup 变成 unhandledRejection。只验退出码分不出这两条路。
  const log = fs.readFileSync(path.join(started.logDirectory, 'main.log'), 'utf8')
  assert.match(log, /"source":"startup"/, '启动失败要标成 startup')
  assert.doesNotMatch(log, /"source":"unhandledRejection"/, '不得退化成兜底路径')

  assert.deepStrictEqual(
    started.mock.errorBoxes.map((box) => box.title),
    ['Algo Learning Platform'],
    '致命错误要给用户看见一个弹窗',
  )
})

test('关掉最后一个窗口后非 macOS 直接退出', async () => {
  const started = await startMain({ granted: true })

  started.mock.app.emit('window-all-closed')

  // darwin 上关窗不退出是平台约定；这里按当前平台分别断言，避免把测试钉死在 win32。
  assert.strictEqual(started.mock.app.quitCallCount, process.platform === 'darwin' ? 0 : 1)
})

test('没有待写会话时 before-quit 不拦截退出', async () => {
  const started = await startMain({ granted: true })

  let preventDefaultCalls = 0
  started.mock.app.emit('before-quit', {
    preventDefault: () => {
      preventDefaultCalls += 1
    },
  })

  /*
   * whenReady 挂住 ⇒ applicationSessionPersistence 仍是 null、没有已开窗口、
   * 窗口创建闸门空闲，也就是"无事可冲"。此时若还 preventDefault，退出就永久挂住
   * （main.ts 只在 flush promise 的 finally 里再调一次 app.quit，而那个 promise
   * 只在真有事可冲时才建）。这条守的是那个死锁，不是 flush 分支本身。
   */
  assert.strictEqual(preventDefaultCalls, 0, '无待写会话时不得拦截 before-quit')
})

test('smoke 专用的 preload / renderer 覆盖在非 smoke 构建里失效', async () => {
  const injected = path.join(tempDir, 'injected')
  setEnv({
    ALGO_ELECTRON_SMOKE: undefined,
    ALGO_ELECTRON_SMOKE_RENDERER_DIST: path.join(injected, 'renderer'),
    ALGO_ELECTRON_SMOKE_OJ_PRELOAD_PATH: path.join(injected, 'oj.mjs'),
    ALGO_ELECTRON_SMOKE_USERSCRIPT_PRELOAD_PATH: path.join(injected, 'us.mjs'),
  })
  const production = await startMain({ granted: false })
  const productionOj = await import('../../electron/browser/tabManagerConfig.ts')
  const productionUserScript = await import('../../electron/scripts/userScriptRuntimeConfig.ts')

  // 这三个常量都在 import 期求值。少了 ALGO_ELECTRON_SMOKE 的前置判断，一个环境变量
  // 就能把 preload 脚本换成任意本地文件——preload 跑在有 Node 权限的上下文里。
  assert.strictEqual(path.basename(production.main.RENDERER_DIST), 'dist')
  assert.strictEqual(path.basename(productionOj.OJ_PRELOAD_PATH), 'ojPreload.mjs')
  assert.strictEqual(
    path.basename(productionUserScript.USER_SCRIPT_BOOTSTRAP_PRELOAD_PATH),
    'userscriptBootstrapPreload.mjs',
  )

  // 正向对照：少了它，上面三条在环境变量名写错时也会绿。
  setEnv({ ALGO_ELECTRON_SMOKE: '1' })
  const smoke = await startMain({ granted: false })
  const smokeOj = await import('../../electron/browser/tabManagerConfig.ts')
  const smokeUserScript = await import('../../electron/scripts/userScriptRuntimeConfig.ts')

  assert.strictEqual(smoke.main.RENDERER_DIST, path.join(injected, 'renderer'))
  assert.strictEqual(smokeOj.OJ_PRELOAD_PATH, path.join(injected, 'oj.mjs'))
  assert.strictEqual(
    smokeUserScript.USER_SCRIPT_BOOTSTRAP_PRELOAD_PATH,
    path.join(injected, 'us.mjs'),
  )
})

/*
 * envSetup 的行为面：它是纯副作用模块，import 即执行，唯一的观察点是替身 app 上
 * 的 setPath 记录。两条断言合起来钉住 design §3 的优先级：显式给定的冒烟目录
 * 压过自动推导的 -dev 后缀，且打包版（isPackaged，见 electronMock 的替身默认值
 * 之外的真实行为）不做隔离——打包路径由 packaged 冒烟（tests/verify.mjs electron）覆盖。
 */
test('未打包且未指定冒烟目录时，userData 在任何模块初始化前追加 -dev 后缀', async () => {
  const started = await startMain({ granted: false })

  assert.deepStrictEqual(
    started.mock.app.setPathCalls.filter(([name]) => name === 'userData'),
    [['userData', `${tempDir}-dev`]],
    'envSetup 必须且只做一次 -dev 后缀改写',
  )
})

test('冒烟模式指定的 userData 覆写优先于 -dev 后缀', async () => {
  const smokeDir = path.join(tempDir, 'smoke-user-data')
  setEnv({ ALGO_ELECTRON_SMOKE: '1', ALGO_ELECTRON_SMOKE_USER_DATA: smokeDir })
  const started = await startMain({ granted: false })

  assert.deepStrictEqual(
    started.mock.app.setPathCalls.filter(([name]) => name === 'userData'),
    [['userData', smokeDir]],
    '显式冒烟目录原样生效，不得混入 -dev 后缀',
  )
})
