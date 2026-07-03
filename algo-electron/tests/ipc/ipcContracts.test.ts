import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

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

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

const coreContracts: PreloadContract[] = [
  // Browser shell
  { method: 'navigate', mode: 'send', channel: 'browser:navigate' },
  { method: 'goBack', mode: 'send', channel: 'browser:goBack' },
  { method: 'goForward', mode: 'send', channel: 'browser:goForward' },
  { method: 'reload', mode: 'send', channel: 'browser:reload' },
  { method: 'goHome', mode: 'send', channel: 'browser:goHome' },
  { method: 'setSidebarWidth', mode: 'send', channel: 'browser:setSidebarWidth' },
  { method: 'hideView', mode: 'send', channel: 'browser:hideView' },
  { method: 'showView', mode: 'send', channel: 'browser:showView' },
  { method: 'captureBrowserPreview', mode: 'invoke', channel: 'browser:capturePreview' },
  { method: 'onUrlChanged', mode: 'on', channel: 'browser:urlChanged' },

  // Problem and tracking surface
  { method: 'listRecentProblems', mode: 'invoke', channel: 'problem:listRecent' },
  { method: 'getProblemDetail', mode: 'invoke', channel: 'problem:getDetail' },
  { method: 'deleteProblem', mode: 'invoke', channel: 'problem:delete' },
  { method: 'onProblemsUpdated', mode: 'on', channel: 'problems:updated' },
  { method: 'getProblemVisitStats', mode: 'invoke', channel: 'stats:getProblemVisitStats' },
  { method: 'getTimeline', mode: 'invoke', channel: 'stats:getTimeline' },

  // Settings and site management
  { method: 'getDefaultHomeUrl', mode: 'invoke', channel: 'config:getDefaultHomeUrl' },
  { method: 'setDefaultHomeUrl', mode: 'send', channel: 'config:setDefaultHomeUrl' },
  { method: 'getRealtimeSubmissionStatus', mode: 'invoke', channel: 'realtimeSubmission:getStatus' },
  { method: 'getAllSites', mode: 'invoke', channel: 'sites:getAll' },
  { method: 'getSiteById', mode: 'invoke', channel: 'sites:getById' },
  { method: 'createSite', mode: 'invoke', channel: 'sites:create' },
  { method: 'updateSite', mode: 'invoke', channel: 'sites:update' },
  { method: 'toggleSite', mode: 'invoke', channel: 'sites:toggle' },
  { method: 'deleteSite', mode: 'invoke', channel: 'sites:delete' },
]

test('preload maps core renderer methods to stable channels', () => {
  const methods = extractPreloadMethods(preloadSource)

  for (const contract of coreContracts) {
    const body = methods.get(contract.method)
    assert.ok(body, `Missing preload method ${contract.method}`)
    assert.ok(
      body.includes(`ipcRenderer.${contract.mode}('${contract.channel}'`),
      `${contract.method} should use ipcRenderer.${contract.mode}('${contract.channel}')`,
    )

    if (contract.mode === 'on') {
      assert.ok(
        body.includes(`ipcRenderer.off('${contract.channel}'`),
        `${contract.method} should unsubscribe from ${contract.channel}`,
      )
    }
  }
})

test('every exposed send/invoke channel has a matching main-process handler', () => {
  const preloadChannels = extractPreloadRendererChannels(preloadSource)
    .filter(channel => channel.mode === 'send' || channel.mode === 'invoke')
  const mainHandlers = extractIpcMainHandlers(electronSources.join('\n'))

  for (const channel of preloadChannels) {
    const expectedMainMode: IpcMainMode = channel.mode === 'invoke' ? 'handle' : 'on'
    assert.ok(
      mainHandlers.some(handler => handler.mode === expectedMainMode && handler.channel === channel.channel),
      `preload ${channel.mode}('${channel.channel}') needs ipcMain.${expectedMainMode}('${channel.channel}')`,
    )
  }
})

test('preload event subscriptions are fixed and backed by main-process sends', () => {
  const listenerChannels = extractPreloadRendererChannels(preloadSource)
    .filter(channel => channel.mode === 'on')
    .map(channel => channel.channel)
    .sort()
  assert.deepStrictEqual(listenerChannels, [
    'browser:urlChanged',
    'problems:updated',
    'tab:listChanged',
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
  assert.ok(!/\bipcRenderer\s*:/.test(preloadSource), 'ipcRenderer must not be exposed as an object property')
  assert.ok(!/exposeInMainWorld\(\s*['"]ipcRenderer['"]/.test(preloadSource), 'ipcRenderer must not be exposed globally')

  const dynamicChannelUse = /ipcRenderer\.(?:send|invoke|on|off)\(\s*(?!['"][^'"]+['"])/.exec(preloadSource)
  assert.strictEqual(dynamicChannelUse, null, 'preload IPC calls must use literal channel names')

  const rendererChannels = new Set(extractPreloadRendererChannels(preloadSource).map(channel => channel.channel))
  const internalChannels = [
    'oj-submission:detected',
    'problem:detected',
    'submissions:detected',
  ]
  for (const channel of internalChannels) {
    assert.ok(!rendererChannels.has(channel), `${channel} must remain internal and unavailable to renderer code`)
  }
})

function extractPreloadMethods(source: string): Map<string, string> {
  const methods = new Map<string, string>()
  const pattern = /^\s{2}([A-Za-z][A-Za-z0-9_]*):\s*([\s\S]*?)(?=^\s{2}[A-Za-z][A-Za-z0-9_]*:|\n}\))/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    methods.set(match[1], match[2])
  }
  return methods
}

function extractPreloadRendererChannels(source: string): { mode: IpcMode; channel: string }[] {
  const channels: { mode: IpcMode; channel: string }[] = []
  const pattern = /ipcRenderer\.(send|invoke|on)\(\s*'([^']+)'/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    channels.push({ mode: match[1] as IpcMode, channel: match[2] })
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

  return handlers
}

function extractSentChannels(source: string): Set<string> {
  const channels = new Set<string>()
  const pattern = /\.send\(\s*'([^']+)'/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    channels.add(match[1])
  }
  return channels
}

function readElectronSources(root: string): string[] {
  const sources: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      sources.push(...readElectronSources(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'preload.ts' && entry.name !== 'ojPreload.ts') {
      sources.push(fs.readFileSync(fullPath, 'utf-8'))
    }
  }
  return sources
}

let failedCount = 0
console.log('Running IPC contract tests...\n')
for (const t of tests) {
  try {
    t.fn()
    console.log(`[PASS] ${t.name}`)
  } catch (err: any) {
    console.error(`[FAIL] ${t.name}`)
    console.error(err.stack || err)
    failedCount++
  }
}

console.log(`\nTests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exit(1)
}
