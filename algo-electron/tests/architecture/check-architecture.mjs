import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const sourceRoots = [
  path.join(projectRoot, 'electron'),
  path.join(projectRoot, 'src'),
]

const checks = []

function check(name, fn) {
  checks.push({ name, fn })
}

function walkSourceFiles(rootDir, files = []) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name)

    if (entry.isDirectory()) {
      walkSourceFiles(entryPath, files)
    } else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function relative(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/')
}

function sourceFiles() {
  return sourceRoots.flatMap((root) => walkSourceFiles(root))
}

function failIfMatches(files, patterns) {
  const failures = []

  for (const file of files) {
    const text = read(file)
    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        failures.push(`${relative(file)}: ${pattern.reason}`)
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'))
  }
}

check('runtime code does not reintroduce Electron BrowserView', () => {
  failIfMatches(sourceFiles(), [
    {
      regex: /import\s*\{[^}]*\bBrowserView\b[^}]*}\s*from\s*['"]electron['"]/,
      reason: 'must not import BrowserView from electron',
    },
    {
      regex: /\bnew\s+BrowserView\s*\(/,
      reason: 'must not instantiate BrowserView',
    },
    {
      regex: /\belectron\.BrowserView\b/,
      reason: 'must not access electron.BrowserView',
    },
  ])
})

check('renderer code does not access ipcRenderer directly', () => {
  failIfMatches(walkSourceFiles(path.join(projectRoot, 'src')), [
    {
      regex: /\bipcRenderer\b/,
      reason: 'renderer must use window.electronAPI helpers instead of ipcRenderer',
    },
  ])
})

check('preload does not expose generic ipcRenderer', () => {
  const preload = read(path.join(projectRoot, 'electron', 'preload.ts'))

  const forbidden = [
    /exposeInMainWorld\(\s*['"]ipcRenderer['"]/,
    /\bipcRenderer\s*:/,
    /\bsend\s*:\s*ipcRenderer\.send\b/,
    /\binvoke\s*:\s*ipcRenderer\.invoke\b/,
  ]

  for (const pattern of forbidden) {
    if (pattern.test(preload)) {
      throw new Error('electron/preload.ts exposes generic ipcRenderer capability')
    }
  }
})

check('ordinary IPC handlers use the trusted shell sender facade', () => {
  const ipcDir = path.join(projectRoot, 'electron', 'ipc')
  const registerFiles = walkSourceFiles(ipcDir).filter((file) => path.basename(file).startsWith('register'))

  failIfMatches(registerFiles, [
    {
      regex: /import\s*\{[^}]*\bipcMain\b[^}]*}\s*from\s*['"]electron['"]/,
      reason: 'ordinary IPC must import the guarded facade from ./trustedSender',
    },
  ])

  for (const file of registerFiles) {
    const text = read(file)
    if (/\bipcMain\.(?:handle|on)\(/.test(text) && !text.includes("from './trustedSender'")) {
      throw new Error(`${relative(file)}: ipcMain registration is missing trustedSender facade`)
    }
  }
})

check('window-sensitive shell actions resolve ownership from the trusted sender', () => {
  const main = read(path.join(projectRoot, 'electron', 'main.ts'))
  if (!main.includes('new WindowManager({ viewRegistry })') || !main.includes('new AppWindow({')) {
    throw new Error('electron/main.ts must create shell windows through WindowManager/AppWindow ownership')
  }
  if (/^let\s+(?:win|tabManager)\b/m.test(main)) {
    throw new Error('electron/main.ts must not restore module-level win/tabManager singletons')
  }

  const browserIpc = read(path.join(projectRoot, 'electron', 'ipc', 'registerBrowserShellIpc.ts'))
  if (!browserIpc.includes('getShellWindowOwner(event)')) {
    throw new Error('browser/window IPC must resolve AppWindow from the trusted sender')
  }
  if (/\bgetWindow\s*:|\bgetTabManager\s*:/.test(browserIpc)) {
    throw new Error('browser/window IPC must not accept global window or TabManager getters')
  }

  for (const name of ['registerBackupIpc.ts', 'registerSitesIpc.ts', 'registerScriptsIpc.ts']) {
    const text = read(path.join(projectRoot, 'electron', 'ipc', name))
    if (!text.includes('getShellWindowOwner')) {
      throw new Error(`electron/ipc/${name} must parent dialogs to the sender window`)
    }
  }
})

check('Nowcoder realtime path stays network-result driven', () => {
  const nowcoderDir = path.join(projectRoot, 'electron', 'adapters', 'sites', 'nowcoder')
  const files = walkSourceFiles(nowcoderDir)

  failIfMatches(files, [
    {
      regex: /createFrontendVerdictHookScript|frontend-verdict-observer|frontendVerdictHook/,
      reason: 'Nowcoder must not use the generic DOM verdict observer for realtime writes',
    },
  ])

  const submissions = read(path.join(nowcoderDir, 'submissions.ts'))
  if (!/nowcoder-judge-status/.test(submissions)) {
    throw new Error('Nowcoder submissions parser must require nowcoder-judge-status network payloads')
  }
})

check('VJudge realtime path stays strongly associated', () => {
  const vjudgeDir = path.join(projectRoot, 'electron', 'adapters', 'sites', 'vjudge')
  const files = walkSourceFiles(vjudgeDir)

  failIfMatches(files, [
    {
      regex: /createFrontendVerdictHookScript|frontend-verdict-observer|frontendVerdictHook/,
      reason: 'VJudge must not use the generic DOM verdict observer for realtime writes',
    },
  ])

  const hook = read(path.join(vjudgeDir, 'hook.ts'))
  for (const token of ['solutionId', 'vjudge-status-data', 'vjudge-solution-data']) {
    if (!hook.includes(token)) {
      throw new Error(`VJudge hook must keep ${token} association logic`)
    }
  }
})

check('real-Electron suites stay out of the Vitest run', () => {
  // A suite that reads its bundle path from the environment cannot run under
  // the Vitest Electron double: it throws before asserting anything, which is
  // how userScriptRuntimeSmoke silently broke `npm run test:all`.
  const vitestConfig = read(path.join(projectRoot, 'vitest.config.ts'))
  const verify = read(path.join(projectRoot, 'tests', 'verify.mjs'))
  const missing = []

  for (const file of walkSourceFiles(path.join(projectRoot, 'tests', 'electron'))) {
    if (!/\.test\.ts$/.test(file)) continue
    const relativePath = relative(file)
    // A module-scope requiredEnvironment() throws during import, before any
    // assertion runs. Files that merely name an env var in a source assertion
    // (mainResilience) or spawn their own Electron child are fine under Vitest.
    if (!/^const \w+ = requiredEnvironment\(/m.test(read(file))) continue
    if (!vitestConfig.includes(relativePath)) {
      missing.push(`${relativePath}: needs a bundle env var but is not excluded in vitest.config.ts`)
    }
    if (!verify.includes(path.basename(file))) {
      missing.push(`${relativePath}: excluded from Vitest but never run by tests/verify.mjs`)
    }
  }

  if (missing.length > 0) throw new Error(missing.join('\n'))
})

let failed = 0
console.log('Running architecture guard checks...\n')
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
