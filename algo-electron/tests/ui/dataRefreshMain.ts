import { app, BrowserWindow, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  registerShellProtocol,
  registerShellSchemeAsPrivileged,
  shellUrl,
} from '../../electron/app/appProtocol'
import type { CodeforcesSubmission } from '../../electron/adapters/sites/codeforces/submissions'
import { dataChangedPayloadSchema, type DataChangedPayload } from '../../src/shared/types/data'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

function requiredPath(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`The data-refresh test requires ${name}`)
  return value
}

const userData = requiredPath('ALP_DATA_REFRESH_USER_DATA')
const rendererDist = requiredPath('ALP_DATA_REFRESH_RENDERER_DIST')
const preloadPath = requiredPath('ALP_DATA_REFRESH_PRELOAD')
const tmpRoot = path.resolve(process.cwd(), 'tmp')
for (const candidate of [userData, rendererDist, preloadPath]) {
  if (!path.resolve(candidate).startsWith(`${tmpRoot}${path.sep}`)) {
    throw new Error('The data-refresh test may only use paths inside the package tmp directory')
  }
}

// Set isolation before importing DB/logging modules; no production profile is opened.
fs.mkdirSync(userData, { recursive: true })
app.setPath('userData', userData)
app.setPath('sessionData', userData)
registerShellSchemeAsPrivileged()

async function start(): Promise<void> {
  const [{ initDbAtPath, closeDb }, problems, { installDataRefreshBridge }] = await Promise.all([
    import('../../electron/db/connection'),
    import('../../electron/db/repositories/problemRepository'),
    import('../../electron/shared/dataRefreshBridge'),
  ])
  const [trusted, problemIpc, statsIpc, aiIpc, ratingIpc, submissionIpc, syncModule, writerModule] =
    await Promise.all([
      import('../../electron/ipc/trustedSender'),
      import('../../electron/ipc/registerProblemIpc'),
      import('../../electron/ipc/registerStatsIpc'),
      import('../../electron/ipc/registerAiIpc'),
      import('../../electron/ipc/registerRatingIpc'),
      import('../../electron/ipc/registerSubmissionsIpc'),
      import('../../electron/submissions/syncService'),
      import('../../electron/submissions/createDefaultSubmissionBatchWriter'),
    ])

  initDbAtPath(path.join(userData, 'data', 'refresh.sqlite'))
  problems.upsertProblem({
    platform: 'codeforces',
    platformProblemId: '1000A',
    canonicalUrl: 'https://codeforces.com/contest/1000/problem/A',
    contestId: '1000',
    problemIndex: 'A',
    title: 'Refresh acceptance problem',
    confidence: 'url',
  })
  const problemId = problems.findProblemIdByPlatformKey('codeforces', '1000A')
  if (!problemId) throw new Error('The fixture problem was not persisted')

  const networkRequests: string[] = []
  const nativeFetch = globalThis.fetch
  const submissions: CodeforcesSubmission[] = [
    {
      id: 900001,
      contestId: 1000,
      problem: { contestId: 1000, index: 'A', name: 'Refresh acceptance problem' },
      verdict: 'OK',
      programmingLanguage: 'GNU C++23',
      creationTimeSeconds: Math.floor(Date.UTC(2026, 10, 4, 1) / 1000),
    },
    {
      id: 900002,
      contestId: 1000,
      problem: { contestId: 1000, index: 'B', name: 'Newly synchronized problem' },
      verdict: 'WRONG_ANSWER',
      programmingLanguage: 'GNU C++23',
      creationTimeSeconds: Math.floor(Date.UTC(2026, 10, 4, 1, 1) / 1000),
    },
  ]
  globalThis.fetch = async (input) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    )
    if (
      url.origin !== 'https://codeforces.com' ||
      url.pathname !== '/api/user.status' ||
      url.searchParams.get('handle') !== 'fixture-handle' ||
      url.searchParams.get('from') !== '1' ||
      url.searchParams.get('count') !== '100'
    ) {
      throw new Error('Unexpected outbound fetch in the data-refresh fixture')
    }
    networkRequests.push(url.pathname)
    return Response.json({ status: 'OK', result: submissions })
  }
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true }),
  )

  const syncService = new syncModule.SyncService({
    batchWriter: writerModule.createDefaultSubmissionBatchWriter(),
  })
  problemIpc.registerProblemIpc()
  statsIpc.registerStatsIpc()
  aiIpc.registerAiIpc()
  ratingIpc.registerRatingIpc()
  submissionIpc.registerSubmissionsIpc({ getSyncService: () => syncService })
  registerShellProtocol(rendererDist)

  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  trusted.registerShellWebContents(win.webContents)
  const broadcasts: DataChangedPayload[] = []
  const disposeBridge = installDataRefreshBridge({
    sendToAll(channel, ...args) {
      if (channel === IPC_CHANNELS.DATA.CHANGED) {
        // The production bridge owns the typed payload; capture only public topic names.
        broadcasts.push(dataChangedPayloadSchema.strict().parse(args[0]))
      }
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, ...args)
      }
    },
  })
  Object.assign(globalThis, {
    dataRefreshSnapshot: () => ({
      networkRequests: [...networkRequests],
      broadcasts: [...broadcasts],
      totalProblems: problems.getProblemCount(),
      detail: problems.getProblemDetail(problemId),
    }),
  })
  app.once('will-quit', () => {
    disposeBridge()
    globalThis.fetch = nativeFetch
    closeDb()
  })
  await win.loadURL(
    `${shellUrl('/dataRefreshHarness.html')}?problemId=${encodeURIComponent(problemId)}`,
  )
}

void app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })
app.on('window-all-closed', () => app.quit())
