// @vitest-environment jsdom
import assert from 'node:assert'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  USER_SCRIPT_COMPILED_CATALOG_KEY,
  type UserScriptCompiledCatalogEntry,
} from '../../electron/scripts/userScriptCompiledCatalog'
import { buildUserScriptMainWorldRuntime } from '../../electron/scripts/userScriptMainWorldRuntime'
import {
  USER_SCRIPT_RUNTIME_INIT_CHANNEL,
  USER_SCRIPT_RUNTIME_PORT_CHANNEL,
} from '../../electron/scripts/userScriptRuntimeProtocol'

/**
 * `electron/scripts/userscriptBootstrapPreload.ts` 的模块级测试。
 *
 * 用户脚本运行时的入口。真实 Electron 冒烟（userScriptRuntimeSmoke）验的是打包后
 * 的 bundle 能在真页面上把脚本跑起来；这里补的是拒绝分支与失败清理——非 http 源、
 * 超长 frameUrl、nonce 不匹配、catalog 缺失、executeInMainWorld 抛错，这些在冒烟里
 * 造不出来，而它们都在"要不要把特权运行时装进这一帧"的判断上。
 *
 * 与 ojPreload 的测试同一个坑：`vi.resetModules()` 会连 electron 别名一起重置，
 * 所有句柄都必须从 loadBootstrap 的返回值里取，不能从文件顶层 import。
 */

interface BootstrapHarness {
  /** 本次加载暴露到 main world 的键（桥名带随机 nonce，只看形状） */
  exposedKeys: string[]
  /** postMessage 到主进程的调用：转交 MessagePort 的那一步 */
  portCalls: { channel: string, payload: unknown, transfer: unknown[] }[]
  /** sendSync 收到的初始化请求 */
  initRequests: unknown[]
  /** 主世界函数的返回值。false 表示 catalog 或桥没就位 */
  executed: unknown
  /** 主世界函数收到的实参 */
  executeArgs: unknown[]
}

interface CatalogInvocation {
  payload: unknown
  send: (message: unknown) => void
  subscribe: (listener: (message: unknown) => void) => void
}

/** 在 catalog 里放一条 generation 对应的编译产物，返回它收到的调用 */
function plantCatalog(generation: number, options: { scriptId?: string, revision?: string } = {}): {
  invocations: CatalogInvocation[]
} {
  const invocations: CatalogInvocation[] = []
  const entry: UserScriptCompiledCatalogEntry = {
    func: (payload, sendMessage, subscribe) => { invocations.push({ payload, send: sendMessage, subscribe }) },
    // payload 里带 code 的完整 descriptor 只存在于主世界 catalog，不过 IPC。
    // 运行时快照只带 id/revision/values，靠这两项在这里对回来。
    /*
     * 用生产的 builder 造 payload，而不是手写字面量再 `as` 过去。
     *
     * 手写那份是**输入形状**（`source` / `grants`），而 catalog 里存的是**产物形状**
     * （`ScriptDescriptor`：没有 `source`，grants 已编译成 `permissions` 的 26 个布尔）。
     * `as` 把这个错误盖住了，代价是下面"code 应来自 catalog"那条断言在验一个真实 payload
     * 里根本不存在的字段——它一直通过，靠的是这里手写时顺手编了一个 `source`。
     *
     * 换成 builder 之后不需要任何 cast，也不会再和生产的 payload 形状脱钩。
     */
    payload: buildUserScriptMainWorldRuntime({
      handshakeId: 'catalog',
      targetOrigin: 'https://catalog.invalid',
      generation,
      scripts: [{
        id: options.scriptId ?? 'script-1',
        revision: options.revision ?? 'rev-1',
        name: 'demo',
        namespace: null,
        description: null,
        version: null,
        runAt: 'document-end',
        source: 'console.log(1)',
        grants: [],
        values: [],
        resources: [],
      }],
    }).execution.args[0],
    body: '',
  }
  Object.defineProperty(globalThis, USER_SCRIPT_COMPILED_CATALOG_KEY, {
    value: new Map([[String(generation), entry]]),
    configurable: true,
    writable: true,
  })
  return { invocations }
}

/**
 * 按给定的页面地址与主进程应答重新加载 bootstrap preload。
 * 模块在 import 时读 location 并同步 sendSync，所以两者都要提前摆好。
 */
async function loadBootstrap(options: {
  url?: string
  response?: unknown
  /** 主世界函数抛错，模拟 catalog 里的 func 崩了 */
  throwOnExecute?: boolean
}): Promise<BootstrapHarness> {
  vi.resetModules()
  // 走替身自己的路径而不是 'electron'：resetElectronMock / exposedMainWorld 只存在于
  // 替身上，借 'electron' 这个真实模块名拿到的是真 Electron 的类型，这两个名字都不在。
  // vitest 的 electron 别名指向的就是这个文件，解析后同一个模块 id，实例是同一个——
  // 上面那条"句柄必须从 loadBootstrap 返回值里取"的约束因此依然成立。
  const electron = await import('../electron/electronMock')
  electron.resetElectronMock()

  const url = options.url ?? 'https://codeforces.com/problemset/problem/1/A'
  // location 是 import 期读的，且 jsdom 的 window.location 不可直接赋值。
  const parsed = new URL(url)
  vi.stubGlobal('location', { href: url, origin: parsed.origin })

  const initRequests: unknown[] = []
  let nonce = ''
  electron.ipcRenderer.on('send-sync', (event: { returnValue: unknown }, channel: unknown, request: unknown) => {
    if (channel !== USER_SCRIPT_RUNTIME_INIT_CHANNEL) return
    initRequests.push(request)
    nonce = (request as { nonce: string }).nonce
    // 应答里的 nonce 必须回填成请求里那个随机值——测试拿不到它，只能在这里补。
    const response = options.response
    event.returnValue = response && typeof response === 'object' && 'nonce' in response
      ? response
      : { ...(response as object), nonce }
  })

  const portCalls: BootstrapHarness['portCalls'] = []
  electron.ipcRenderer.on('post-message', (channel: unknown, payload: unknown, transfer: unknown[]) => {
    portCalls.push({ channel: String(channel), payload, transfer })
  })

  let executed: unknown
  const executeArgs: unknown[] = []
  const realExecute = electron.contextBridge.executeInMainWorld
  electron.contextBridge.executeInMainWorld = (script: Electron.ExecutionScript) => {
    executeArgs.push(...(script.args ?? []))
    if (options.throwOnExecute) throw new Error('main world blew up')
    executed = realExecute(script)
    return executed
  }

  await import('../../electron/scripts/userscriptBootstrapPreload')
  // 桥的搭建在 queueMicrotask 里，等它落地。
  await new Promise(resolve => { queueMicrotask(() => resolve(undefined)) })
  await Promise.resolve()

  return {
    exposedKeys: [...electron.exposedMainWorld.keys()],
    portCalls,
    initRequests,
    executed,
    executeArgs,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  Reflect.deleteProperty(globalThis, USER_SCRIPT_COMPILED_CATALOG_KEY)
})

describe('userscriptBootstrapPreload 装载条件', () => {
  test('http(s) 页面上握手并装好运行时', async () => {
    const catalog = plantCatalog(7)
    const harness = await loadBootstrap({ response: { ok: true, generation: 7, scripts: [] } })

    assert.strictEqual(harness.initRequests.length, 1)
    const request = harness.initRequests[0] as { nonce: string, frameUrl: string, isMainFrame: boolean }
    // nonce 是 32 位十六进制随机值，主进程按同样的口径校验。
    expect(request.nonce).toMatch(/^[a-f0-9]{32}$/)
    assert.strictEqual(request.frameUrl, 'https://codeforces.com/problemset/problem/1/A')
    assert.strictEqual(request.isMainFrame, true)

    // 桥名带 nonce：每帧一把，页面猜不到别的帧的桥。
    assert.strictEqual(harness.exposedKeys.length, 1)
    expect(harness.exposedKeys[0]).toMatch(/^__algoUserscriptBridge_[a-f0-9]{32}$/)
    assert.strictEqual(harness.executed, true)
    assert.strictEqual(catalog.invocations.length, 1)

    // 装好后才把 MessagePort 交给主进程；顺序反了主进程会拿到一个没人接的 port。
    assert.strictEqual(harness.portCalls.length, 1)
    assert.strictEqual(harness.portCalls[0].channel, USER_SCRIPT_RUNTIME_PORT_CHANNEL)
    assert.strictEqual(harness.portCalls[0].transfer.length, 1)
    assert.deepStrictEqual(
      { ...(harness.portCalls[0].payload as Record<string, unknown>), nonce: 'redacted' },
      { nonce: 'redacted', frameUrl: 'https://codeforces.com/problemset/problem/1/A', generation: 7 },
    )
  })

  test('非 http(s) 源上压根不握手', async () => {
    // 内部页（app://）、about:、data: 这些不该装用户脚本运行时，也不该发起握手。
    plantCatalog(7)
    for (const url of ['about:blank', 'data:text/html,<p>x', 'file:///C:/tmp/page.html']) {
      const harness = await loadBootstrap({ url, response: { ok: true, generation: 7, scripts: [] } })
      assert.deepStrictEqual(harness.initRequests, [], `${url} 不应握手`)
      assert.deepStrictEqual(harness.exposedKeys, [], `${url} 不应暴露桥`)
    }
  })

  test('frameUrl 超长时不握手', async () => {
    // 8192 是与主进程一致的上限。超长 URL 多来自跳转链拼接，不值得为它装运行时。
    plantCatalog(7)
    const harness = await loadBootstrap({
      url: `https://codeforces.com/?q=${'a'.repeat(8_200)}`,
      response: { ok: true, generation: 7, scripts: [] },
    })
    assert.deepStrictEqual(harness.initRequests, [])
    assert.deepStrictEqual(harness.exposedKeys, [])
  })
})

describe('userscriptBootstrapPreload 应答校验', () => {
  const generation = 7

  test('主进程拒绝时不装桥', async () => {
    plantCatalog(generation)
    const harness = await loadBootstrap({ response: { ok: false } })
    assert.strictEqual(harness.initRequests.length, 1, '仍应握手过一次')
    assert.deepStrictEqual(harness.exposedKeys, [])
    assert.deepStrictEqual(harness.portCalls, [])
  })

  test('nonce 不匹配时不装桥', async () => {
    // 这是防重放的关键一条：应答必须带回本帧刚生成的 nonce。
    plantCatalog(generation)
    const harness = await loadBootstrap({
      response: { ok: true, nonce: 'b'.repeat(32), generation, scripts: [] },
    })
    assert.deepStrictEqual(harness.exposedKeys, [])
    assert.deepStrictEqual(harness.portCalls, [])
  })

  test('generation 或 scripts 形状不对时不装桥', async () => {
    plantCatalog(generation)
    for (const response of [
      { ok: true, generation: -1, scripts: [] },
      { ok: true, generation: 1.5, scripts: [] },
      { ok: true, generation, scripts: 'nope' },
      { ok: true, generation },
    ]) {
      const harness = await loadBootstrap({ response })
      assert.deepStrictEqual(harness.exposedKeys, [], `${JSON.stringify(response)} 不应装桥`)
    }
  })
})

describe('userscriptBootstrapPreload 失败清理', () => {
  test('catalog 里没有对应 generation 时收回桥并不交 port', async () => {
    // 主进程说的 generation 与预载进主世界的编译产物对不上，通常是导航竞态。
    plantCatalog(7)
    const harness = await loadBootstrap({ response: { ok: true, generation: 9, scripts: [] } })
    assert.strictEqual(harness.executed, false)
    assert.deepStrictEqual(harness.portCalls, [], '装不起来就不能把 port 交出去')
  })

  test('主世界执行抛错时不交 port', async () => {
    plantCatalog(7)
    const harness = await loadBootstrap({ response: { ok: true, generation: 7, scripts: [] }, throwOnExecute: true })
    assert.strictEqual(harness.executeArgs.length, 1, '应已尝试执行')
    assert.deepStrictEqual(harness.portCalls, [])
  })

  test('装载失败后主世界不残留桥对象', async () => {
    // 主世界函数拿到桥就 Reflect.deleteProperty 掉，无论后面成不成。
    // 页面因此没有机会从 globalThis 上摸到它。
    plantCatalog(7)
    const harness = await loadBootstrap({ response: { ok: true, generation: 9, scripts: [] } })
    const bridgeKey = harness.exposedKeys[0]
    assert.ok(bridgeKey, '桥应先 expose 过')
    assert.strictEqual(Reflect.has(globalThis, bridgeKey), false, `${bridgeKey} 应已从主世界删掉`)
  })
})

describe('userscriptBootstrapPreload 传给运行时的数据', () => {
  test('只把 id/revision/values 过 IPC，code 从主世界 catalog 取', async () => {
    // 这条是设计约束而非实现细节：脚本正文不进 IPC payload。
    // 快照里的 values 与 catalog 里的 descriptor 按 id\0revision 对齐后合并。
    const catalog = plantCatalog(7, { scriptId: 'script-1', revision: 'rev-1' })
    const harness = await loadBootstrap({
      response: {
        ok: true,
        generation: 7,
        scripts: [{ id: 'script-1', revision: 'rev-1', values: [['k', 'v']] }],
      },
    })

    assert.strictEqual(harness.executed, true)
    assert.strictEqual(catalog.invocations.length, 1)
    const payload = catalog.invocations[0].payload as {
      targetOrigin: string
      generation: number
      scripts: { id: string, name: string, permissions: object, values: unknown }[]
    }
    assert.strictEqual(payload.targetOrigin, 'https://codeforces.com')
    assert.strictEqual(payload.generation, 7)
    assert.strictEqual(payload.scripts.length, 1)
    // descriptor 侧的字段来自 catalog：快照只送 id/revision/values，name 和 permissions
    // 只可能是 catalog 给的。原先这里验的是 `source`，而真实 descriptor 上没有这个字段——
    // 那条断言实际在验测试自己编的 fixture，换成真实存在的字段才算验到合并逻辑。
    assert.strictEqual(payload.scripts[0].name, 'demo', 'descriptor 应来自 catalog')
    assert.ok(payload.scripts[0].permissions, 'permissions 应来自 catalog 的编译产物')
    assert.deepStrictEqual(payload.scripts[0].values, [['k', 'v']], 'values 应来自本次快照')
    // 第 266 行那条设计约束的正向断言：正文既不在 IPC 快照里，也不在主世界 payload 里
    //（它只存在于 catalog entry 的 body 字符串）。原先靠 fixture 编的 `source` 反而把它掩盖了。
    for (const key of ['source', 'code']) {
      assert.strictEqual(
        Object.hasOwn(payload.scripts[0], key), false,
        `脚本正文不应出现在 payload 的 ${key} 字段`,
      )
    }
  })

  test('revision 对不上的脚本被丢掉，不按旧 descriptor 跑', async () => {
    // 脚本改了但 catalog 还是旧版时，宁可不跑也不跑错版本。
    const catalog = plantCatalog(7, { scriptId: 'script-1', revision: 'rev-1' })
    const harness = await loadBootstrap({
      response: {
        ok: true,
        generation: 7,
        scripts: [{ id: 'script-1', revision: 'rev-2', values: [] }],
      },
    })
    assert.strictEqual(harness.executed, true)
    const payload = catalog.invocations[0].payload as { scripts: unknown[] }
    assert.deepStrictEqual(payload.scripts, [])
  })
})

describe('userscriptBootstrapPreload 消息桥', () => {
  /**
   * MessagePort 的投递排在宏任务里。曾经固定等一轮 `setTimeout(0)`，在 worker
   * 繁忙时约 1/4 概率投递落到下一轮，全套里就变成间歇性失败。改成按条件轮询：
   * 收到就立刻继续，超时才让断言去报真实差异。
   */
  const waitForDelivery = async (received: unknown[]): Promise<void> => {
    for (let attempt = 0; attempt < 50 && received.length === 0; attempt += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 1) })
    }
  }

  test('运行时拿到的 send/subscribe 接在交给主进程的那个 port 上', async () => {
    // 桥的两个闭包是运行时与主进程之间的唯一通道。交出去的是 port2，
    // 所以这里拿 port2 当主进程侧用：send 应该能被它收到，它发的应该能被 subscribe 收到。
    const catalog = plantCatalog(7)
    const harness = await loadBootstrap({ response: { ok: true, generation: 7, scripts: [] } })

    const bridge = catalog.invocations[0]
    const port = harness.portCalls[0].transfer[0] as MessagePort

    const fromRuntime: unknown[] = []
    port.onmessage = (event) => { fromRuntime.push(event.data) }
    bridge.send({ kind: 'log', text: 'hello' })
    await waitForDelivery(fromRuntime)
    assert.deepStrictEqual(fromRuntime, [{ kind: 'log', text: 'hello' }])

    const toRuntime: unknown[] = []
    bridge.subscribe((message) => { toRuntime.push(message) })
    port.postMessage({ kind: 'value', key: 'k' })
    await waitForDelivery(toRuntime)
    // 交给运行时的是 event.data 而不是 MessageEvent：运行时侧的契约按裸数据写的，
    // 这里回退成传 event 的话，那边读 message.kind 会静默拿到 undefined。
    assert.deepStrictEqual(toRuntime, [{ kind: 'value', key: 'k' }])
  })
})
