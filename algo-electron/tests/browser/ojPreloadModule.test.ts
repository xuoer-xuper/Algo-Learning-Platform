// @vitest-environment jsdom
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'
import {
  OJ_SUBMISSION_BRIDGE_CHANNEL,
  OJ_SUBMISSION_IPC_CHANNEL,
  OJ_SUBMISSION_TOKEN_CHANNEL,
} from '../../electron/browser/ojBridge'
import { OJ_CREDENTIAL_FILL_CHANNEL } from '../../electron/credentials/autofill/credentialAutofillBridge'
import { OJ_CREDENTIAL_CAPTURE_CHANNEL } from '../../electron/credentials/captureBridge'

/**
 * `electron/browser/ojPreload.ts` 的模块级测试。
 *
 * 这个文件是远程 OJ 页面里唯一的特权入口，B6.7 的缺陷就出在这里，而它当时正好
 * 在覆盖率排除名单上——排除项盖住了出问题的地方。真实 Electron 冒烟
 * （ojSubmissionBridgeSmoke）跑的是打包后的 bundle，验的是 trusted-sender 门禁；
 * 这里补的是另一半：token 拿不到时的重试、pageUrl 不匹配时的拒填这类分支，
 * 冒烟里造不出来。
 *
 * 模块是纯副作用的（import 即执行）且持有模块级 documentToken，每个场景都要重新
 * 加载。**必须连 electron 替身一起重新取**：`vi.resetModules()` 会把 electron 别名
 * 也重置，新加载的 preload 写进的是另一个 exposedMainWorld 实例，用文件顶层 import
 * 来的那份断言只会看到空 Map——更糟的是"不该发生"的负向用例会因为压根没接线而
 * 空过。所以下面所有句柄都从 loadPreload 的返回值里拿，测试文件顶层不 import electron。
 */

const VALID_TOKEN = 'a'.repeat(32)

interface SendCall { channel: string, payload: unknown }

interface Harness {
  /** 暴露给页面的提交桥 */
  bridge: { reportSubmission: (payload: unknown) => void }
  /** 本次加载暴露到 main world 的全部键 */
  exposedKeys: string[]
  /** 录下 ipcRenderer.send 的流量，返回值随录随读 */
  recordSends: () => { calls: SendCall[], stop: () => void }
  /** 向本次加载的 ipcRenderer 投递一条主进程事件 */
  emit: (channel: string, payload: unknown) => void
}

/**
 * 装好 token handler 后重新加载 ojPreload，返回绑定到这次模块实例的句柄。
 * tokens 是逐次返回值：第一项给首次请求，第二项给重试；Error 表示这次请求抛错。
 */
async function loadPreload(tokens: unknown[]): Promise<Harness> {
  vi.resetModules()
  /*
   * 动态 import 替身文件本身，而不是 `await import('electron')`。
   *
   * 必须是动态的：`vi.resetModules()` 之后 ojPreload 会拿到一份新的替身实例，
   * 顶部静态导入的那份就不是同一个对象了，`exposedMainWorld` 会是空的。
   * 但路径要写替身的真实路径——`resetElectronMock` / `exposedMainWorld` 是替身专有的导出，
   * 真实 Electron 从来没有它们，借 'electron' 这个名字拿只能让 tsc 报"属性不存在"。
   * vitest 的 alias 把 'electron' 指向的就是这个文件，所以两种写法拿到的是同一个模块实例。
   */
  const electron = await import('../electron/electronMock')
  electron.resetElectronMock()

  let call = 0
  electron.ipcMain.handle(OJ_SUBMISSION_TOKEN_CHANNEL, () => {
    const value = tokens[Math.min(call, tokens.length - 1)]
    call += 1
    if (value instanceof Error) throw value
    return value
  })

  await import('../../electron/browser/ojPreload')
  // 构造期的 token invoke 是异步的，让它落地后再交给用例。
  await flush()

  const exposed = electron.exposedMainWorld.get(OJ_SUBMISSION_BRIDGE_CHANNEL)
  assert.ok(exposed && typeof exposed === 'object', 'ojPreload 必须暴露提交桥')

  return {
    bridge: exposed as { reportSubmission: (payload: unknown) => void },
    exposedKeys: [...electron.exposedMainWorld.keys()],
    recordSends: () => {
      const calls: SendCall[] = []
      const onSend = (channel: unknown, payload: unknown) => {
        calls.push({ channel: String(channel), payload })
      }
      electron.ipcRenderer.on('send', onSend)
      return { calls, stop: () => { electron.ipcRenderer.off('send', onSend) } }
    },
    emit: (channel, payload) => { electron.ipcRenderer.emit(channel, {}, payload) },
  }
}

/** 等 reportSubmission / 填充链路内部的 promise 走完 */
async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.resetModules()
})

describe('ojPreload 模块级行为', () => {
  test('只暴露提交桥一个入口，不暴露通用 IPC', async () => {
    const harness = await loadPreload([VALID_TOKEN])
    assert.deepStrictEqual(harness.exposedKeys, [OJ_SUBMISSION_BRIDGE_CHANNEL])
    assert.deepStrictEqual(Object.keys(harness.bridge), ['reportSubmission'])
  })

  test('token 有效时把 token 与 payload 一起上报', async () => {
    const harness = await loadPreload([VALID_TOKEN])
    const recorder = harness.recordSends()
    harness.bridge.reportSubmission({ verdict: 'AC' })
    await flush()
    recorder.stop()
    assert.deepStrictEqual(recorder.calls, [{
      channel: OJ_SUBMISSION_IPC_CHANNEL,
      payload: { token: VALID_TOKEN, payload: { verdict: 'AC' } },
    }])
  })

  test('页面 postMessage 也走同一条上报路径', async () => {
    const harness = await loadPreload([VALID_TOKEN])
    const recorder = harness.recordSends()
    // source 必须是 window 自身或其子帧，否则转发器丢弃（防跨窗口伪造）。
    // 只能在构造时给：MessageEvent.source 是只读访问器，事后赋值会抛。
    window.dispatchEvent(new MessageEvent('message', {
      data: { channel: OJ_SUBMISSION_BRIDGE_CHANNEL, payload: { verdict: 'WA' } },
      source: window,
    }))
    await flush()
    recorder.stop()
    assert.strictEqual(recorder.calls.length, 1)
    assert.deepStrictEqual(recorder.calls[0].payload, {
      token: VALID_TOKEN,
      payload: { verdict: 'WA' },
    })
  })

  test('首次 token 不合法时重试一次，拿到合法 token 后照常上报', async () => {
    // 32 位十六进制之外的一律当没拿到：长度不对的串不是 token。
    const harness = await loadPreload(['not-a-token', VALID_TOKEN])
    const recorder = harness.recordSends()
    harness.bridge.reportSubmission({ verdict: 'TLE' })
    await flush()
    recorder.stop()
    assert.deepStrictEqual(recorder.calls, [{
      channel: OJ_SUBMISSION_IPC_CHANNEL,
      payload: { token: VALID_TOKEN, payload: { verdict: 'TLE' } },
    }])
  })

  test('重试仍拿不到 token 就静默丢弃，不发无 token 的上报', async () => {
    // 宁可丢一次上报也不发裸 payload：主进程按 token 判归属，无 token 的上报
    // 要么被拒，要么被算到别的页面头上。
    const harness = await loadPreload([null])
    const recorder = harness.recordSends()
    harness.bridge.reportSubmission({ verdict: 'RE' })
    await flush()
    recorder.stop()
    assert.deepStrictEqual(recorder.calls, [])
  })

  test('token 请求抛错时按拿不到处理，不让异常逃到页面', async () => {
    const harness = await loadPreload([new Error('main not ready')])
    const recorder = harness.recordSends()
    harness.bridge.reportSubmission({ verdict: 'CE' })
    await flush()
    recorder.stop()
    assert.deepStrictEqual(recorder.calls, [])
  })
})

describe('ojPreload 凭据填充', () => {
  const fillPayload = {
    credentialId: 'credential-1',
    siteId: 'codeforces',
    username: 'tourist',
    password: 'secret-value',
    usernameSelectors: ['input[name="handle"]'],
    passwordSelectors: ['input[name="password"]'],
    pageUrl: '',
  }

  function loginForm(): { username: HTMLInputElement, password: HTMLInputElement } {
    document.body.innerHTML = `
      <form>
        <input name="handle" />
        <input name="password" type="password" />
      </form>
    `
    return {
      username: document.querySelector('input[name="handle"]') as HTMLInputElement,
      password: document.querySelector('input[name="password"]') as HTMLInputElement,
    }
  }

  test('pageUrl 与当前页一致时填充用户名与密码', async () => {
    const harness = await loadPreload([VALID_TOKEN])
    const fields = loginForm()
    harness.emit(OJ_CREDENTIAL_FILL_CHANNEL, { ...fillPayload, pageUrl: window.location.href })
    await flush()
    assert.strictEqual(fields.username.value, 'tourist')
    assert.strictEqual(fields.password.value, 'secret-value')
  })

  test('pageUrl 与当前页不一致时不填', async () => {
    // 导航竞态的护栏：填充请求异步下发，页面可能已经换了。
    // 上一条正向用例是这条的对照——没有它，接线断了这条也会空过。
    const harness = await loadPreload([VALID_TOKEN])
    const fields = loginForm()
    harness.emit(OJ_CREDENTIAL_FILL_CHANNEL, { ...fillPayload, pageUrl: 'https://other.example.com/login' })
    await flush()
    assert.strictEqual(fields.username.value, '')
    assert.strictEqual(fields.password.value, '')
  })

  test('payload 形状不对时不填', async () => {
    const harness = await loadPreload([VALID_TOKEN])
    const fields = loginForm()
    for (const bad of [null, 'string', { pageUrl: window.location.href }, { ...fillPayload, password: 42 }]) {
      harness.emit(OJ_CREDENTIAL_FILL_CHANNEL, bad)
    }
    await flush()
    assert.strictEqual(fields.username.value, '')
    assert.strictEqual(fields.password.value, '')
  })
})

describe('ojPreload 凭据捕获', () => {
  test('登录表单提交时上报用户名与密码', async () => {
    const harness = await loadPreload([VALID_TOKEN])
    document.body.innerHTML = `
      <form>
        <input name="username" value="tourist" />
        <input name="password" type="password" value="secret-value" />
      </form>
    `
    const recorder = harness.recordSends()
    document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true }))
    recorder.stop()
    assert.deepStrictEqual(recorder.calls, [{
      channel: OJ_CREDENTIAL_CAPTURE_CHANNEL,
      payload: { username: 'tourist', password: 'secret-value' },
    }])
  })

  test('缺密码的表单不上报', async () => {
    const harness = await loadPreload([VALID_TOKEN])
    document.body.innerHTML = '<form><input name="username" value="tourist" /></form>'
    const recorder = harness.recordSends()
    document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true }))
    recorder.stop()
    assert.deepStrictEqual(recorder.calls, [])
  })
})
