import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

type IpcMode = 'send' | 'invoke' | 'on'
type IpcMainMode = 'on' | 'handle'

interface PreloadContract {
  method: string
  mode: IpcMode
  channel: string
}

interface RegisteredChannel {
  mode: IpcMainMode
  channel: string
}

const projectRoot = process.cwd()
const electronRoot = path.join(projectRoot, 'electron')
const preloadPath = path.join(electronRoot, 'preload.ts')
const preloadSource = fs.readFileSync(preloadPath, 'utf-8')
const electronSources = readElectronSources(electronRoot)

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
  // Browser shell
  { method: 'navigate', mode: 'send', channel: 'browser:navigate' },
  { method: 'goBack', mode: 'send', channel: 'browser:goBack' },
  { method: 'goForward', mode: 'send', channel: 'browser:goForward' },
  { method: 'reload', mode: 'send', channel: 'browser:reload' },
  { method: 'goHome', mode: 'send', channel: 'browser:goHome' },
  { method: 'setSidebarWidth', mode: 'send', channel: 'browser:setSidebarWidth' },
  { method: 'getOmniboxSuggestions', mode: 'invoke', channel: 'browser:omniboxSuggest' },
  { method: 'setOmniboxOpen', mode: 'send', channel: 'browser:setOmniboxOpen' },
  { method: 'showAppMenu', mode: 'send', channel: 'browser:showAppMenu' },
  { method: 'showShellContextMenu', mode: 'send', channel: 'browser:showShellContextMenu' },
  { method: 'showTabContextMenu', mode: 'send', channel: 'browser:showTabContextMenu' },
  { method: 'findInPage', mode: 'invoke', channel: 'browser:findInPage' },
  { method: 'setZoom', mode: 'invoke', channel: 'browser:setZoom' },
  { method: 'setDownloadNoticeVisible', mode: 'send', channel: 'browser:setDownloadNoticeVisible' },
  { method: 'setErrorNoticeVisible', mode: 'send', channel: 'browser:setErrorNoticeVisible' },
  { method: 'getUserScriptInstall', mode: 'invoke', channel: 'browser:getUserScriptInstall' },
  { method: 'cancelUserScriptInstall', mode: 'invoke', channel: 'browser:cancelUserScriptInstall' },
  {
    method: 'getRemoteUserScriptInstallPreview',
    mode: 'invoke',
    channel: 'scripts:getRemoteInstallPreview',
  },
  {
    method: 'confirmRemoteUserScriptInstall',
    mode: 'invoke',
    channel: 'scripts:confirmRemoteInstall',
  },
  {
    method: 'cancelRemoteUserScriptInstall',
    mode: 'invoke',
    channel: 'scripts:cancelRemoteInstall',
  },
  { method: 'scriptsCheckUpdates', mode: 'invoke', channel: 'scripts:checkUpdates' },
  { method: 'scriptsGetCode', mode: 'invoke', channel: 'scripts:getCode' },
  { method: 'scriptsOpenEditor', mode: 'invoke', channel: 'scripts:openEditor' },
  {
    method: 'getUserScriptHostPermissionPrompt',
    mode: 'invoke',
    channel: 'userscript:getHostPermissionPrompt',
  },
  {
    method: 'respondUserScriptHostPermission',
    mode: 'invoke',
    channel: 'userscript:respondHostPermission',
  },
  {
    method: 'onUserScriptHostPermissionPrompt',
    mode: 'on',
    channel: 'userscript:hostPermissionRequested',
  },
  { method: 'onFindInPageResult', mode: 'on', channel: 'browser:findInPageResult' },
  { method: 'onZoomChanged', mode: 'on', channel: 'browser:zoomChanged' },
  { method: 'onDownloadResult', mode: 'on', channel: 'download:result' },
  { method: 'onUrlChanged', mode: 'on', channel: 'browser:urlChanged' },
  { method: 'onUiCommand', mode: 'on', channel: 'ui:command' },
  { method: 'reopenClosedTab', mode: 'invoke', channel: 'tab:reopenClosed' },
  { method: 'reorderTab', mode: 'invoke', channel: 'tab:reorder' },
  { method: 'moveTabToNewWindow', mode: 'invoke', channel: 'tab:moveToNewWindow' },
  { method: 'finishTabDrag', mode: 'invoke', channel: 'tab:finishDrag' },
  { method: 'reloadTab', mode: 'send', channel: 'tab:reload' },
  { method: 'dismissUnresponsiveTab', mode: 'send', channel: 'tab:dismissUnresponsive' },
  { method: 'openInternalTab', mode: 'invoke', channel: 'tab:openInternal' },

  // Problem and tracking surface
  { method: 'listRecentProblems', mode: 'invoke', channel: 'problem:listRecent' },
  { method: 'getProblemDetail', mode: 'invoke', channel: 'problem:getDetail' },
  { method: 'deleteProblem', mode: 'invoke', channel: 'problem:delete' },
  { method: 'onProblemsUpdated', mode: 'on', channel: 'problems:updated' },
  { method: 'getProblemVisitStats', mode: 'invoke', channel: 'stats:getProblemVisitStats' },
  { method: 'getTimeline', mode: 'invoke', channel: 'stats:getTimeline' },

  // Settings and site management
  { method: 'getHomeShortcuts', mode: 'invoke', channel: 'config:getHomeShortcuts' },
  { method: 'getSearchEngine', mode: 'invoke', channel: 'config:getSearchEngine' },
  { method: 'setSearchEngine', mode: 'invoke', channel: 'config:setSearchEngine' },
  { method: 'getTheme', mode: 'invoke', channel: 'config:getTheme' },
  { method: 'setTheme', mode: 'invoke', channel: 'config:setTheme' },
  {
    method: 'getRealtimeSubmissionStatus',
    mode: 'invoke',
    channel: 'realtimeSubmission:getStatus',
  },
  { method: 'getAllSites', mode: 'invoke', channel: 'sites:getAll' },
  { method: 'getSiteById', mode: 'invoke', channel: 'sites:getById' },
  { method: 'createSite', mode: 'invoke', channel: 'sites:create' },
  { method: 'toggleSite', mode: 'invoke', channel: 'sites:toggle' },
  { method: 'deleteSite', mode: 'invoke', channel: 'sites:delete' },
  { method: 'getCookieSummaryForSite', mode: 'invoke', channel: 'cookies:getSiteSummary' },
  { method: 'getCookieSummaryForDomain', mode: 'invoke', channel: 'cookies:getDomainSummary' },
  { method: 'listCredentials', mode: 'invoke', channel: 'credentials:list' },
  { method: 'deleteCredential', mode: 'invoke', channel: 'credentials:delete' },
  { method: 'renameCredential', mode: 'invoke', channel: 'credentials:rename' },
  { method: 'getCredentialAutofillPrompt', mode: 'invoke', channel: 'credentials:autofillPrompt' },
  { method: 'respondCredentialAutofill', mode: 'invoke', channel: 'credentials:autofillRespond' },
  { method: 'onCredentialAutofillPrompt', mode: 'on', channel: 'credentials:autofillPrompt' },
  { method: 'getCredentialCapturePrompt', mode: 'invoke', channel: 'credentials:capturePrompt' },
  { method: 'respondCredentialCapture', mode: 'invoke', channel: 'credentials:captureRespond' },
  { method: 'onCredentialCapturePrompt', mode: 'on', channel: 'credentials:capturePrompt' },
  { method: 'onCredentialCaptureResult', mode: 'on', channel: 'credentials:captureResult' },
]

test('preload maps core renderer methods to stable channels', () => {
  const methods = extractPreloadMethods(preloadSource)

  for (const contract of coreContracts) {
    const body = methods.get(contract.method)
    assert.ok(body, `Missing preload method ${contract.method}`)
    const reference = constantPathByChannel.get(contract.channel)
    assert.ok(reference, `${contract.channel} must be declared in IPC_CHANNELS`)
    // prettier 会把过长的 invoke(...) 拆成多行，比对前先把空白全部去掉。
    const compactBody = body.replace(/\s+/g, '')
    assert.ok(
      compactBody.includes(`ipcRenderer.${contract.mode}(${reference}`),
      `${contract.method} should use ipcRenderer.${contract.mode}(${reference}) for ${contract.channel}`,
    )

    if (contract.mode === 'on') {
      assert.ok(
        compactBody.includes(`ipcRenderer.off(${reference}`),
        `${contract.method} should unsubscribe from ${contract.channel}`,
      )
    }
  }
})

test('every exposed send/invoke channel has a matching main-process handler', () => {
  const preloadChannels = extractPreloadRendererChannels(preloadSource).filter(
    (channel) => channel.mode === 'send' || channel.mode === 'invoke',
  )
  const mainHandlers = extractIpcMainHandlers(electronSources.join('\n'))

  for (const channel of preloadChannels) {
    const expectedMainMode: IpcMainMode = channel.mode === 'invoke' ? 'handle' : 'on'
    assert.ok(
      mainHandlers.some(
        (handler) => handler.mode === expectedMainMode && handler.channel === channel.channel,
      ),
      `preload ${channel.mode}('${channel.channel}') needs ipcMain.${expectedMainMode}('${channel.channel}')`,
    )
  }
})

test('preload event subscriptions are fixed and backed by main-process sends', () => {
  const listenerChannels = extractPreloadRendererChannels(preloadSource)
    .filter((channel) => channel.mode === 'on')
    .map((channel) => channel.channel)
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
  const methods = extractPreloadMethods(preloadSource)
  const exposedMethodNames = [...methods.keys()]
  assert.ok(!exposedMethodNames.includes('send'))
  assert.ok(!exposedMethodNames.includes('invoke'))
  assert.ok(!exposedMethodNames.includes('on'))
  assert.ok(!exposedMethodNames.includes('off'))
  assert.ok(
    !/\bipcRenderer\s*:/.test(preloadSource),
    'ipcRenderer must not be exposed as an object property',
  )
  assert.ok(
    !/exposeInMainWorld\(\s*['"]ipcRenderer['"]/.test(preloadSource),
    'ipcRenderer must not be exposed globally',
  )

  // 每个调用的首个非空白 token 必须是引号（历史形态的字面量）或 IPC_CHANNELS（R1 之后的主形态）。
  // 必须 matchAll 扫全文件：单次 exec 在第一个 IPC_CHANNELS 调用处就返回，其后 191 处里的
  // 动态通道会漏检（复核 2026-11-01 实证的可绕过）。断言用"首个非空白字符 + 后随标识符"
  // 而不是 (?!…) 前瞻：\s* 后接前瞻会在空白上回溯，把换行后的合法调用也误判成动态通道。
  const dynamicChannelTokens = [
    ...preloadSource.matchAll(/ipcRenderer\.(?:send|invoke|on|off)\(\s*([^'"\s][A-Za-z0-9_]*)/g),
  ]
    .map((match) => match[1])
    .filter((token) => token !== 'IPC_CHANNELS')
  assert.deepStrictEqual(
    dynamicChannelTokens,
    [],
    'preload IPC calls must use IPC_CHANNELS constants (or string literals), not dynamic channels',
  )

  const rendererChannels = new Set(
    extractPreloadRendererChannels(preloadSource).map((channel) => channel.channel),
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

function extractPreloadMethods(source: string): Map<string, string> {
  const methods = new Map<string, string>()
  const pattern =
    /^\s{2}([A-Za-z][A-Za-z0-9_]*):\s*([\s\S]*?)(?=^\s{2}[A-Za-z][A-Za-z0-9_]*:|\n}\))/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    methods.set(match[1], match[2])
  }
  return methods
}

function extractPreloadRendererChannels(source: string): { mode: IpcMode; channel: string }[] {
  const channels: { mode: IpcMode; channel: string }[] = []
  // 两种形态都认：旧的字面量与 R1 之后的 IPC_CHANNELS.<域>.<键> 引用。
  const pattern = /ipcRenderer\.(send|invoke|on)\(\s*('([^']+)'|IPC_CHANNELS\.[A-Za-z0-9_.]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const raw = match[2]
    const channel = raw.startsWith("'") ? match[3] : channelByConstantPath.get(raw)
    if (channel === undefined) continue
    channels.push({ mode: match[1] as IpcMode, channel })
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
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      entry.name !== 'preload.ts' &&
      entry.name !== 'ojPreload.ts'
    ) {
      sources.push(fs.readFileSync(fullPath, 'utf-8'))
    }
  }
  return sources
}
