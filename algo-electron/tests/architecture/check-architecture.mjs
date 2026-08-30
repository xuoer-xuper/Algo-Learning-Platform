import fs from 'node:fs'
import path from 'node:path'
import { collectRatchetFailures, countBareControls, countBareSql } from './guards.mjs'

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

// 棘轮白名单：只减不增。判定逻辑在 ./guards.mjs，由
// tests/architecture/guards.test.ts 反向验证（违规重现时必须失败）。
function checkRatchet({ files, budgets, countMatches, describe, cleanupHint }) {
  const entries = files.map((file) => ({ path: relative(file), count: countMatches(read(file)) }))
  const failures = collectRatchetFailures({ entries, budgets, describe, cleanupHint })
  if (failures.length > 0) throw new Error(failures.join('\n'))
}

// 迁移期欠账。逐个搬进 electron/db/ 后把条目删掉，不要上调数字。
// 建立守卫时 13 个文件 61 处；已归位 electron/tracking/trackingRepository.ts
// （4 处，改名 db/repositories/problemVisitRepository.ts），现 12 个文件 57 处。
const BARE_SQL_BUDGET = {
  // 泛表导出/导入，34 处按表展开的 SELECT/INSERT。搬迁需要先设计
  // "按表清单批量读写"的 repository 接口，单独一块做。
  'electron/backup/learningDataExport.ts': 34,
  'electron/notes/NoteService.ts': 12,
  'electron/ai/contextExporter.ts': 2,
  'electron/ai/contextTagStats.ts': 1,
  'electron/ai/recommendations/reviewPlanner.ts': 1,
  'electron/ai/recommendations/reviewRecommender.ts': 1,
  'electron/ai/recommendations/weaknessAnalyzer.ts': 1,
  'electron/app/mainServices.ts': 1,
  'electron/app/recentSitePreconnect.ts': 1,
  'electron/ipc/registerRatingIpc.ts': 1,
  'electron/submissions/createDefaultSubmissionBatchWriter.ts': 1,
  'electron/tracking/orphanProblemVisits.ts': 1,
}

check('bare SQL stays inside electron/db/', () => {
  const files = walkSourceFiles(path.join(projectRoot, 'electron'))
    .filter((file) => !relative(file).startsWith('electron/db/'))

  checkRatchet({
    files,
    budgets: BARE_SQL_BUDGET,
    countMatches: countBareSql,
    describe: (count) => `在 electron/db/ 之外构造了 ${count} 处 SQL 语句`,
    cleanupHint: '查询应放进 electron/db/repositories/ 下的 repository，由业务层调用',
  })
})

check('renderer components reach the main process only through *Api.ts', () => {
  // main.tsx 同步读取 preload 注入的布局常量（不是 IPC 调用），且是入口文件，
  // 没有更上层可以搬。这是唯一豁免。
  const ENTRY_EXEMPT = new Set(['src/main.tsx'])
  const failures = []

  for (const file of walkSourceFiles(path.join(projectRoot, 'src'))) {
    const rel = relative(file)
    if (ENTRY_EXEMPT.has(rel)) continue
    // *Api.ts 是约定的数据访问层，通道名只应出现在这里。
    if (/Api\.ts$/.test(rel)) continue
    if (!/\bwindow\.electronAPI\b/.test(read(file))) continue

    failures.push(`${rel}: 组件与 hook 不得直连 window.electronAPI，请收进同域的 *Api.ts`)
  }

  if (failures.length > 0) throw new Error(failures.join('\n'))
})

// 两类合法例外 + 一类待清理欠账，条目里注明属于哪一类。
const BARE_CONTROL_BUDGET = {
  // 浏览器原生 chrome：几何按像素对齐系统窗口装饰，ui/Button 的内边距与
  // 圆角体系不适用。属长期例外，不是欠账。
  'src/components/WindowControls.tsx': 3,
  'src/components/TabStrip.tsx': 3,
  'src/components/BrowserToolbar.tsx': 6,
  'src/components/Omnibox.tsx': 2,
  'src/components/FindInPageBar.tsx': 1,

  // Coach 独立视觉域：styles/tokens.css 与 .coach-action-btn 是刻意分叉的
  // 深色系统（桌宠窗置顶透明，与主窗浅色壳不共享 token）。属长期例外。
  'src/features/coach/CoachActions.tsx': 4,
  'src/features/coach/CoachBubble.tsx': 3,
  'src/features/coach/CoachChatPanel.tsx': 3,

  // 待清理欠账（Q4 目标）。
  'src/features/home/HomePage.tsx': 2,
  'src/features/problems/ProblemSidebar.tsx': 5,
  'src/features/problems/NoteEditorPane.tsx': 2,
  'src/features/scripts/UserScriptEditor.tsx': 1,
  'src/components/ErrorBoundary.tsx': 1,
}

check('interactive controls come from src/components/ui/', () => {
  const files = walkSourceFiles(path.join(projectRoot, 'src'))
    .filter((file) => /\.tsx$/.test(file) && !relative(file).startsWith('src/components/ui/'))

  checkRatchet({
    files,
    budgets: BARE_CONTROL_BUDGET,
    countMatches: countBareControls,
    describe: (count) => `有 ${count} 处裸交互控件`,
    cleanupHint: '按钮与表单控件从 src/components/ui 取用（Button/IconButton/Input/Select/Textarea）',
  })
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
