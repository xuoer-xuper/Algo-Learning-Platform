import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'
import { extractApiMethods, readApiLiteralSource, readPreloadSource } from './preloadApiExtractor'

type IpcMode = 'send' | 'invoke' | 'on'
type IpcMainMode = 'on' | 'handle'

interface PreloadContract {
  /** R3 起暴露面按域分组，方法以 `域.方法` 寻址（`problem.listRecent`）。 */
  domain: string
  method: string
  mode: IpcMode
  channel: string
}

interface RegisteredChannel {
  mode: IpcMainMode
  channel: string
}

const projectRoot = process.cwd()
const preloadSource = readPreloadSource()
const preloadApiSource = readApiLiteralSource(preloadSource)
const electronSources = readElectronSources(path.join(projectRoot, 'electron'))

/*
 * 阶段 2 R1 起生产代码不再写 channel 字面量，一律引用 `IPC_CHANNELS` 常量。文本扫描
 * 因此要先把 `IPC_CHANNELS.<域>.<键>` 引用解析回 channel 值才能和契约表比对：
 * - `channelByConstantPath`：引用文本 → 值（解析源码里出现的是哪个 channel）；
 * - `constantPathByChannel`：值 → 引用文本（断言某方法体引用了正确的常量）。
 */
const channelByConstantPath = new Map<string, string>()
const constantPathByChannel = new Map<string, string>()
{
  for (const [domain, channels] of Object.entries(IPC_CHANNELS)) {
    for (const [key, value] of Object.entries(channels as Record<string, string>)) {
      const reference = `IPC_CHANNELS.${domain}.${key}`
      channelByConstantPath.set(reference, value)
      constantPathByChannel.set(value, reference)
    }
  }
}

const coreContracts: PreloadContract[] = [
  { domain: 'data', method: 'onChanged', mode: 'on', channel: 'data:changed' },
  // Browser shell
  { domain: 'browser', method: 'navigate', mode: 'send', channel: 'browser:navigate' },
  { domain: 'browser', method: 'goBack', mode: 'send', channel: 'browser:goBack' },
  { domain: 'browser', method: 'goForward', mode: 'send', channel: 'browser:goForward' },
  { domain: 'browser', method: 'reload', mode: 'send', channel: 'browser:reload' },
  { domain: 'browser', method: 'goHome', mode: 'send', channel: 'browser:goHome' },
  {
    domain: 'browser',
    method: 'setSidebarWidth',
    mode: 'send',
    channel: 'browser:setSidebarWidth',
  },
  {
    domain: 'browser',
    method: 'getOmniboxSuggestions',
    mode: 'invoke',
    channel: 'browser:omniboxSuggest',
  },
  { domain: 'browser', method: 'setOmniboxOpen', mode: 'send', channel: 'browser:setOmniboxOpen' },
  { domain: 'browser', method: 'showAppMenu', mode: 'send', channel: 'browser:showAppMenu' },
  {
    domain: 'browser',
    method: 'showShellContextMenu',
    mode: 'send',
    channel: 'browser:showShellContextMenu',
  },
  {
    domain: 'browser',
    method: 'showTabContextMenu',
    mode: 'send',
    channel: 'browser:showTabContextMenu',
  },
  { domain: 'browser', method: 'findInPage', mode: 'invoke', channel: 'browser:findInPage' },
  { domain: 'browser', method: 'setZoom', mode: 'invoke', channel: 'browser:setZoom' },
  {
    domain: 'browser',
    method: 'setDownloadNoticeVisible',
    mode: 'send',
    channel: 'browser:setDownloadNoticeVisible',
  },
  {
    domain: 'browser',
    method: 'setErrorNoticeVisible',
    mode: 'send',
    channel: 'browser:setErrorNoticeVisible',
  },
  {
    domain: 'scripts',
    method: 'getPendingInstall',
    mode: 'invoke',
    channel: 'browser:getUserScriptInstall',
  },
  {
    domain: 'scripts',
    method: 'cancelPendingInstall',
    mode: 'invoke',
    channel: 'browser:cancelUserScriptInstall',
  },
  {
    domain: 'scripts',
    method: 'getRemoteInstallPreview',
    mode: 'invoke',
    channel: 'scripts:getRemoteInstallPreview',
  },
  {
    domain: 'scripts',
    method: 'confirmRemoteInstall',
    mode: 'invoke',
    channel: 'scripts:confirmRemoteInstall',
  },
  {
    domain: 'scripts',
    method: 'cancelRemoteInstall',
    mode: 'invoke',
    channel: 'scripts:cancelRemoteInstall',
  },
  { domain: 'scripts', method: 'checkUpdates', mode: 'invoke', channel: 'scripts:checkUpdates' },
  { domain: 'scripts', method: 'getCode', mode: 'invoke', channel: 'scripts:getCode' },
  { domain: 'scripts', method: 'openEditor', mode: 'invoke', channel: 'scripts:openEditor' },
  {
    domain: 'scripts',
    method: 'getHostPermissionPrompt',
    mode: 'invoke',
    channel: 'userscript:getHostPermissionPrompt',
  },
  {
    domain: 'scripts',
    method: 'respondHostPermission',
    mode: 'invoke',
    channel: 'userscript:respondHostPermission',
  },
  {
    domain: 'scripts',
    method: 'onHostPermissionPrompt',
    mode: 'on',
    channel: 'userscript:hostPermissionRequested',
  },
  {
    domain: 'browser',
    method: 'onFindInPageResult',
    mode: 'on',
    channel: 'browser:findInPageResult',
  },
  { domain: 'browser', method: 'onZoomChanged', mode: 'on', channel: 'browser:zoomChanged' },
  { domain: 'browser', method: 'onDownloadResult', mode: 'on', channel: 'download:result' },
  { domain: 'browser', method: 'onUrlChanged', mode: 'on', channel: 'browser:urlChanged' },
  { domain: 'browser', method: 'onUiCommand', mode: 'on', channel: 'ui:command' },
  { domain: 'tab', method: 'reopenClosed', mode: 'invoke', channel: 'tab:reopenClosed' },
  { domain: 'tab', method: 'reorder', mode: 'invoke', channel: 'tab:reorder' },
  { domain: 'tab', method: 'moveToNewWindow', mode: 'invoke', channel: 'tab:moveToNewWindow' },
  { domain: 'tab', method: 'finishDrag', mode: 'invoke', channel: 'tab:finishDrag' },
  { domain: 'tab', method: 'reload', mode: 'send', channel: 'tab:reload' },
  {
    domain: 'tab',
    method: 'dismissUnresponsive',
    mode: 'send',
    channel: 'tab:dismissUnresponsive',
  },
  { domain: 'tab', method: 'openInternal', mode: 'invoke', channel: 'tab:openInternal' },

  // Problem and tracking surface
  { domain: 'problem', method: 'listRecent', mode: 'invoke', channel: 'problem:listRecent' },
  { domain: 'problem', method: 'getDetail', mode: 'invoke', channel: 'problem:getDetail' },
  { domain: 'problem', method: 'delete', mode: 'invoke', channel: 'problem:delete' },
  { domain: 'problem', method: 'onUpdated', mode: 'on', channel: 'problems:updated' },
  {
    domain: 'stats',
    method: 'getProblemVisitStats',
    mode: 'invoke',
    channel: 'stats:getProblemVisitStats',
  },
  { domain: 'stats', method: 'getTimeline', mode: 'invoke', channel: 'stats:getTimeline' },

  // Settings and site management
  {
    domain: 'config',
    method: 'getHomeShortcuts',
    mode: 'invoke',
    channel: 'config:getHomeShortcuts',
  },
  {
    domain: 'config',
    method: 'getSearchEngine',
    mode: 'invoke',
    channel: 'config:getSearchEngine',
  },
  {
    domain: 'config',
    method: 'setSearchEngine',
    mode: 'invoke',
    channel: 'config:setSearchEngine',
  },
  { domain: 'config', method: 'getTheme', mode: 'invoke', channel: 'config:getTheme' },
  { domain: 'config', method: 'setTheme', mode: 'invoke', channel: 'config:setTheme' },
  {
    domain: 'submissions',
    method: 'getRealtimeStatus',
    mode: 'invoke',
    channel: 'realtimeSubmission:getStatus',
  },
  { domain: 'sites', method: 'getAll', mode: 'invoke', channel: 'sites:getAll' },
  { domain: 'sites', method: 'getById', mode: 'invoke', channel: 'sites:getById' },
  { domain: 'sites', method: 'create', mode: 'invoke', channel: 'sites:create' },
  { domain: 'sites', method: 'toggle', mode: 'invoke', channel: 'sites:toggle' },
  { domain: 'sites', method: 'delete', mode: 'invoke', channel: 'sites:delete' },
  {
    domain: 'cookies',
    method: 'getSiteSummary',
    mode: 'invoke',
    channel: 'cookies:getSiteSummary',
  },
  { domain: 'credentials', method: 'list', mode: 'invoke', channel: 'credentials:list' },
  { domain: 'credentials', method: 'delete', mode: 'invoke', channel: 'credentials:delete' },
  { domain: 'credentials', method: 'rename', mode: 'invoke', channel: 'credentials:rename' },
  {
    domain: 'credentials',
    method: 'getAutofillPrompt',
    mode: 'invoke',
    channel: 'credentials:autofillPrompt',
  },
  {
    domain: 'credentials',
    method: 'respondAutofill',
    mode: 'invoke',
    channel: 'credentials:autofillRespond',
  },
  {
    domain: 'credentials',
    method: 'onAutofillPrompt',
    mode: 'on',
    channel: 'credentials:autofillPrompt',
  },
  {
    domain: 'credentials',
    method: 'getCapturePrompt',
    mode: 'invoke',
    channel: 'credentials:capturePrompt',
  },
  {
    domain: 'credentials',
    method: 'respondCapture',
    mode: 'invoke',
    channel: 'credentials:captureRespond',
  },
  {
    domain: 'credentials',
    method: 'onCapturePrompt',
    mode: 'on',
    channel: 'credentials:capturePrompt',
  },
  {
    domain: 'credentials',
    method: 'onCaptureResult',
    mode: 'on',
    channel: 'credentials:captureResult',
  },
]

test('preload maps core renderer methods to stable channels', () => {
  const methods = extractApiMethods(preloadApiSource)

  for (const contract of coreContracts) {
    const body = methods.get(`${contract.domain}.${contract.method}`)
    assert.ok(body, `Missing preload method ${contract.domain}.${contract.method}`)
    const reference = constantPathByChannel.get(contract.channel)
    assert.ok(reference, `${contract.channel} must be declared in IPC_CHANNELS`)
    // prettier 会把过长的 invoke(...) 拆成多行，比对前先把空白全部去掉。
    const compactBody = body.replace(/\s+/g, '')
    if (contract.mode === 'on') {
      // 订阅统一走 subscribe() 助手（ipcRenderer.on/off 只在那里出现一次）。
      // prettier 的多行实参带尾逗号（`subscribe(X,\n    ),`），compact 后允许一个 `,`。
      assert.ok(
        new RegExp(`subscribe(?:<[^>]*>)?\\(${escapeRegExp(reference)},?\\)`).test(compactBody),
        `${contract.domain}.${contract.method} should subscribe via subscribe(${reference})`,
      )
    } else {
      assert.ok(
        compactBody.includes(`ipcRenderer.${contract.mode}(${reference}`),
        `${contract.domain}.${contract.method} should use ipcRenderer.${contract.mode}(${reference}) for ${contract.channel}`,
      )
    }
  }
})

test('every exposed send/invoke channel has a matching main-process handler', () => {
  const preloadChannels = extractPreloadRendererChannels(preloadSource).filter(
    (entry) => entry.mode === 'send' || entry.mode === 'invoke',
  )
  const mainHandlers = extractIpcMainHandlers(electronSources.join('\n'))

  for (const entry of preloadChannels) {
    const expectedMainMode: IpcMainMode = entry.mode === 'invoke' ? 'handle' : 'on'
    assert.ok(
      mainHandlers.some(
        (handler) => handler.mode === expectedMainMode && handler.channel === entry.channel,
      ),
      `preload ${entry.mode}('${entry.channel}') needs ipcMain.${expectedMainMode}('${entry.channel}')`,
    )
  }
})

test('preload event subscriptions are fixed and backed by main-process sends', () => {
  const listenerChannels = extractPreloadRendererChannels(preloadSource)
    .filter((entry) => entry.mode === 'on')
    .map((entry) => entry.channel)
    .sort()
  assert.deepStrictEqual(listenerChannels, [
    'browser:findInPageResult',
    'browser:urlChanged',
    'browser:zoomChanged',
    'coach:configChanged',
    'coach:contestModeChanged',
    'coach:dismissBubble',
    'coach:petStateChanged',
    'coach:showBubble',
    'credentials:autofillPrompt',
    'credentials:capturePrompt',
    'credentials:captureResult',
    'data:changed',
    'download:result',
    'problems:updated',
    'tab:listChanged',
    'ui:command',
    'userscript:hostPermissionRequested',
    'window:maximized',
  ])

  const sentChannels = extractSentChannels(electronSources.join('\n'))
  for (const channel of listenerChannels) {
    assert.ok(sentChannels.has(channel), `${channel} should be sent by the main process`)
  }
})

test('renderer cannot access arbitrary IPC channels through preload', () => {
  const methods = extractApiMethods(preloadApiSource)
  for (const key of methods.keys()) {
    assert.ok(
      !/\.(send|invoke|on|off)$/.test(key) && !/^(send|invoke|on|off)\./.test(key),
      `api method ${key} must not be a generic IPC capability`,
    )
  }
  assert.ok(
    !/\bipcRenderer\s*:/.test(preloadSource),
    'ipcRenderer must not be exposed as an object property',
  )
  assert.ok(
    !/exposeInMainWorld\(\s*['"]ipcRenderer['"]/.test(preloadSource),
    'ipcRenderer must not be exposed globally',
  )

  // 每个调用的首个非空白 token 必须是引号（历史形态的字面量）或 IPC_CHANNELS（R1 之后的主
  // 形态）。invoke/send 只允许出现在 api 字面量里；订阅统一走 subscribe() 助手，全文件
  // 只有它那两处 ipcRenderer.on/off，且 channel 形参是 IpcChannel 闭集（拼错编译期就报，
  // 不靠这里的文本扫描）。
  const dynamicChannelTokens = [
    ...preloadSource.matchAll(/ipcRenderer\.(?:send|invoke)\(\s*([^'"\s][A-Za-z0-9_]*)/g),
  ]
    .map((match) => match[1])
    .filter((token) => token !== 'IPC_CHANNELS')
  assert.deepStrictEqual(
    dynamicChannelTokens,
    [],
    'preload IPC calls must use IPC_CHANNELS constants (or string literals), not dynamic channels',
  )

  const onOffCalls = [...preloadSource.matchAll(/ipcRenderer\.(?:on|off)\(/g)]
  assert.strictEqual(
    onOffCalls.length,
    2,
    'ipcRenderer.on/off 只允许出现在 subscribe() 助手里（注册一次、退订一次）',
  )
  const helperStart = preloadSource.indexOf('function subscribe')
  const helperEnd = preloadSource.indexOf('const api = {')
  const helper = preloadSource.slice(helperStart, helperEnd)
  assert.ok(
    /ipcRenderer\.on\(channel, wrapped\)/.test(helper),
    'subscribe() 必须经 ipcRenderer.on 注册',
  )
  assert.ok(
    /ipcRenderer\.off\(channel, wrapped\)/.test(helper),
    'subscribe() 必须经 ipcRenderer.off 退订',
  )
  assert.match(
    helper,
    /function subscribe<T>\(channel: IpcChannel\)/,
    'subscribe() 的 channel 形参必须是 IpcChannel 闭集',
  )

  const rendererChannels = new Set(
    extractPreloadRendererChannels(preloadSource).map((entry) => entry.channel),
  )
  const internalChannels = [
    'oj-submission:detected',
    'oj-credentials:fill',
    'oj-credentials:capture',
  ]
  for (const channel of internalChannels) {
    assert.ok(
      !rendererChannels.has(channel),
      `${channel} must remain internal and unavailable to renderer code`,
    )
  }
})

test('retired renderer notification channels have no remaining senders', () => {
  const source = electronSources.join('\n')
  for (const channel of ['problem:detected', 'submissions:detected']) {
    assert.ok(!preloadSource.includes(channel), `${channel} must not remain in preload`)
    assert.ok(!source.includes(channel), `${channel} must not remain in main-process sources`)
  }
})

function extractPreloadRendererChannels(source: string): { mode: IpcMode; channel: string }[] {
  const channels: { mode: IpcMode; channel: string }[] = []
  // 三种形态都认：字面量（历史）、R1 之后的直接 IPC_CHANNELS 引用、R3 起的
  // subscribe(IPC_CHANNELS.… ) 订阅助手（ipcRenderer.on 收进助手后，订阅通道从这里提）。
  const directPattern =
    /ipcRenderer\.(send|invoke|on)\(\s*('([^']+)'|IPC_CHANNELS\.[A-Za-z0-9_.]+)/g
  let match: RegExpExecArray | null
  while ((match = directPattern.exec(source)) !== null) {
    const raw = match[2]
    const channel = raw.startsWith("'") ? match[3] : channelByConstantPath.get(raw)
    if (channel === undefined) continue
    channels.push({ mode: match[1] as IpcMode, channel })
  }

  const subscribePattern = /subscribe(?:<[^>]*>)?\(\s*(IPC_CHANNELS\.[A-Za-z0-9_.]+)/g
  while ((match = subscribePattern.exec(source)) !== null) {
    const channel = channelByConstantPath.get(match[1])
    if (channel !== undefined) channels.push({ mode: 'on', channel })
  }
  return channels
}

function extractIpcMainHandlers(source: string): RegisteredChannel[] {
  const constants = new Map<string, string>()
  const constantPattern = /const\s+([A-Z0-9_]+)\s*=\s*'([^']+)'/g
  let constantMatch: RegExpExecArray | null
  while ((constantMatch = constantPattern.exec(source)) !== null) {
    constants.set(constantMatch[1], constantMatch[2])
  }

  const handlers: RegisteredChannel[] = []
  const literalPattern = /ipcMain\.(handle|on)\(\s*'([^']+)'/g
  let literalMatch: RegExpExecArray | null
  while ((literalMatch = literalPattern.exec(source)) !== null) {
    handlers.push({ mode: literalMatch[1] as IpcMainMode, channel: literalMatch[2] })
  }

  const constantHandlerPattern = /ipcMain\.(handle|on)\(\s*([A-Z0-9_]+)/g
  let constantHandlerMatch: RegExpExecArray | null
  while ((constantHandlerMatch = constantHandlerPattern.exec(source)) !== null) {
    const channel = constants.get(constantHandlerMatch[2])
    if (channel) handlers.push({ mode: constantHandlerMatch[1] as IpcMainMode, channel })
  }

  // R1 之后的主形态：channel 直接引用 IPC_CHANNELS 常量对象。
  const sharedConstantHandlerPattern = /ipcMain\.(handle|on)\(\s*(IPC_CHANNELS\.[A-Za-z0-9_.]+)/g
  let sharedConstantMatch: RegExpExecArray | null
  while ((sharedConstantMatch = sharedConstantHandlerPattern.exec(source)) !== null) {
    const channel = channelByConstantPath.get(sharedConstantMatch[2])
    if (channel) handlers.push({ mode: sharedConstantMatch[1] as IpcMainMode, channel })
  }

  const guardedLiteralPattern = /(handleFromShell|onFromShell|onFromOj)\(\s*'([^']+)'/g
  let guardedLiteralMatch: RegExpExecArray | null
  while ((guardedLiteralMatch = guardedLiteralPattern.exec(source)) !== null) {
    handlers.push({
      mode: guardedLiteralMatch[1] === 'handleFromShell' ? 'handle' : 'on',
      channel: guardedLiteralMatch[2],
    })
  }

  const guardedConstantPattern = /(handleFromShell|onFromShell|onFromOj)\(\s*([A-Z0-9_]+)/g
  let guardedConstantMatch: RegExpExecArray | null
  while ((guardedConstantMatch = guardedConstantPattern.exec(source)) !== null) {
    const channel = constants.get(guardedConstantMatch[2])
    if (channel) {
      handlers.push({
        mode: guardedConstantMatch[1] === 'handleFromShell' ? 'handle' : 'on',
        channel,
      })
    }
  }

  const guardedSharedConstantPattern =
    /(handleFromShell|onFromShell|onFromOj)\(\s*(IPC_CHANNELS\.[A-Za-z0-9_.]+)/g
  let guardedSharedConstantMatch: RegExpExecArray | null
  while ((guardedSharedConstantMatch = guardedSharedConstantPattern.exec(source)) !== null) {
    const channel = channelByConstantPath.get(guardedSharedConstantMatch[2])
    if (channel) {
      handlers.push({
        mode: guardedSharedConstantMatch[1] === 'handleFromShell' ? 'handle' : 'on',
        channel,
      })
    }
  }

  return handlers
}

function extractSentChannels(source: string): Set<string> {
  const channels = new Set<string>()
  // 字面量与 IPC_CHANNELS 引用两种形态都认，值集合才是契约。
  const literalPattern = /\.(?:send|sendToAll)\(\s*'([^']+)'/g
  let match: RegExpExecArray | null
  while ((match = literalPattern.exec(source)) !== null) {
    channels.add(match[1])
  }
  const constantPattern = /\.(?:send|sendToAll)\(\s*(IPC_CHANNELS\.[A-Za-z0-9_.]+)/g
  while ((match = constantPattern.exec(source)) !== null) {
    const channel = channelByConstantPath.get(match[1])
    if (channel !== undefined) channels.add(channel)
  }
  return channels
}

function readElectronSources(root: string): string[] {
  const sources: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      sources.push(...readElectronSources(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'ojPreload.ts') {
      // ojPreload 走 OJ 隔离 preload 的独立通道面（oj-*），不参与壳 renderer 的契约扫描；
      // shell preload 自 R3 起住在 src/preload/index.ts，本来就不在这棵树里。
      sources.push(fs.readFileSync(fullPath, 'utf-8'))
    }
  }
  return sources
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&')
}
