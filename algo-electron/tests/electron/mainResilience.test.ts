import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'vitest'

/**
 * 本文件剩下的都是**语句顺序**断言：它们守的东西活在 main.ts 这个顶层启动脚本内部，
 * 没有可 import 的接缝。
 *
 * 能行为化的部分已经搬走了，别在这里重复加：
 * - 单实例闸门、协议 / IPC / 生命周期注册、启动失败上报、退出不死锁、smoke 专用
 *   env 覆盖 → tests/electron/mainStartupContract.test.ts（真 import main.ts）
 * - 各协作模块自身的行为 → tests/app/shellRendererRecovery、tests/app/mainProcessErrors、
 *   tests/browser/tabSessionLifecycle、tests/windows/WindowCreationGate、
 *   tests/windows/applicationSessionStore、tests/windows/applicationSessionSnapshot
 *
 * 为什么这一批搬不走：绝大多数落在 `createWindowOnce` 和 `app.whenReady()` 的 async
 * 体里。两者都不导出，唯一的进入方式是让 whenReady 真 resolve——那会真开数据库、
 * 真建窗口、真写 userData，成了集成冒烟（tests/verify.mjs electron 跑的就是它），
 * 不是单元测试。要退掉这些断言得先把那两段抽成模块，那是生产改动。
 *
 * 这类断言的已知代价，看的人要清楚：接线断了但字符串还在时它照样绿，纯格式化或
 * 搬移没改行为时它却红。所以下面只钉"顺序错了会出真 bug"的那几处，不钉写法。
 */
const mainSource = fs.readFileSync('electron/main.ts', 'utf8')

test('shell 渲染进程崩溃恢复挂在 shell 自己的 webContents 上，且退出中不重载', () => {
  // installShellRendererRecovery 的行为（崩溃重载、干净退出不重载、已销毁不重载）
  // 由 tests/app/shellRendererRecovery.test.ts 覆盖。这里只钉 main.ts 传了什么：
  // 传错 webContents（比如传标签页的）会让崩溃恢复重载错对象。
  assert.match(mainSource, /installShellRendererRecovery\(win\.webContents/)
  // 少了这个判断，退出过程中的崩溃会触发重载，把正在关的窗口拉回来，退出卡死。
  assert.match(mainSource, /shouldReload: \(\) => !isQuitting/)
})

test('会话恢复的三处先后顺序：先载快照、再建窗口、最后接全局持久化', () => {
  const loadIndex = mainSource.indexOf('await loadStartupApplicationSession()')
  const creationEnableIndex = mainSource.indexOf('windowCreationGate.enable()')
  const persistenceIndex = mainSource.indexOf('new ApplicationSessionPersistence(')
  const restoreIndex = mainSource.indexOf('tabManager.restoreSession({')
  const shellLoadIndex = mainSource.indexOf('win.loadURL(')

  // 反了就会先开一个空窗口，再拿快照去恢复——用户看到窗口闪一下，且空窗口会被
  // 当成"当前状态"覆盖掉存档。
  assert.ok(creationEnableIndex > loadIndex, '快照载入前必须一直关着窗口创建闸门')
  // 反了的话渲染进程 did-finish-load 时标签还没恢复，首屏拿到空标签列表。
  assert.ok(shellLoadIndex > restoreIndex, '标签恢复必须早于 shell 渲染进程加载')
  // 反了会在窗口还没恢复出来时先写一次空快照，把存档冲掉。
  assert.ok(persistenceIndex > creationEnableIndex, '全局持久化要等恢复出的窗口都在了才起')
})

test('smoke 模式不读写用户的会话存档', () => {
  // smoke 跑在一次性 userData 上，但会话文件路径来自 app.getPath('userData')。
  // 少了这层 if，冒烟测试会把用户真实的窗口 / 标签存档读出来再覆盖掉。
  assert.match(
    mainSource,
    /if \(!STARTUP_SMOKE_MODE\) \{[\s\S]+?new ApplicationSessionStore\([\s\S]+?await loadStartupApplicationSession\(\)/,
  )
})

test('会话快照的四个触发源都接到防抖调度上', () => {
  // 少任何一个，那类变化就不会被记进存档：标签增删改、窗口移动、缩放、最大化状态。
  // 这里逐条列而不写成一条带顺序的正则——四次注册互相独立，钉顺序只会在无害的
  // 重排上误报（这正是上一版 move/resize 那条正则的问题）。
  assert.match(mainSource, /tabManager\.addSessionChangeListener\(scheduleApplicationSession\)/)
  assert.match(mainSource, /win\.on\('move', scheduleApplicationSession\)/)
  assert.match(mainSource, /win\.on\('resize', scheduleApplicationSession\)/)
  assert.match(mainSource, /win\.on\('maximize', scheduleApplicationSession\)/)
  assert.match(mainSource, /win\.on\('unmaximize', scheduleApplicationSession\)/)
  // 切换活动窗口也要记：mostRecentWindowId 决定下次启动先恢复哪个窗口并激活它。
  assert.match(
    mainSource,
    /windowManager\.addMostRecentWindowChangeListener\(\(\) => \{[\s\S]+?scheduleApplicationSession\(\)/,
  )
  // 快照要带上"最近使用的是哪个窗口"。恢复顺序语义由
  // tests/windows/applicationSessionSnapshot.test.ts 覆盖，这里只钉 main.ts 真把它传了进去。
  assert.match(mainSource, /createApplicationSessionSnapshot\([\s\S]+?windowManager\.getMostRecent\(\)\?\.id/)
  assert.match(mainSource, /new ApplicationSessionPersistence\([\s\S]+?getCurrentApplicationSessionSnapshot/)
})

test('窗口关闭与进程退出前都要把会话写完', () => {
  // installWindowSessionFlush 自身行为见 tests/browser/tabSessionLifecycle.test.ts；
  // 这里钉 main.ts 把 flush 接到了全局持久化上，而不是接了个空实现。
  assert.match(mainSource, /installWindowSessionFlush\(win, \{[\s\S]+?applicationSessionPersistence\?\.flush\(\)/)
  // 退出时还有窗口在建就得等它建完再写，否则那个窗口不会进存档。
  // mainStartupContract 只能覆盖"无事可冲时不拦截"那一侧——要造出 isRunning 为真，
  // 得先让 whenReady 跑完并真建窗口，所以这一侧留在源码断言里。
  assert.match(
    mainSource,
    /hasPendingWindowCreation = windowCreationGate\.isRunning[\s\S]+?windowCreationGate\.stop\(\)[\s\S]+?windowCreationGate\.waitForIdle\(\)/,
  )
  assert.match(
    mainSource,
    /app\.on\('before-quit', \(event\) => \{[\s\S]+?event\.preventDefault\(\)[\s\S]+?applicationSessionPersistence\?\.dispose\(\)[\s\S]+?app\.quit\(\)/,
  )
})

test('多窗口装配不回退到已删掉的单窗口机制', () => {
  /*
   * 三条禁止名单。这类"别再长回来"的守卫，源码文本正是对的工具——
   * 行为测试没法断言"某个类不存在"。
   */
  // 旧的按窗口持久化，会和 ApplicationSessionPersistence 抢同一个文件互相覆盖。
  assert.doesNotMatch(mainSource, /new TabSessionPersistence\(/)
  // 旧的窗口级 runtime 表，多窗口下按窗口存 TabManager 会漏掉转移出去的标签。
  assert.doesNotMatch(mainSource, /windowSessionRuntimes/)
  // 预热隐藏窗口曾导致空窗口进存档、以及退出时多一个不受管的 BrowserWindow。
  assert.doesNotMatch(mainSource, /\.warmup\(/)
})

test('下载结果回到发起下载的那个窗口', () => {
  // DownloadManager 只负责把 captureResultContext 的返回值原样带回结果回调
  // （见 tests/downloads/downloadManager.test.ts）；"那个值是窗口 id"是 main.ts 的接线。
  // 改成常量或 undefined，下载完成提示就会飘到别的窗口或干脆没人收。
  assert.match(mainSource, /captureResultContext:[\s\S]+?windowManager\.resolveDownloadSource\(/)
})

test('关掉最后一个 shell 时连桌宠一起收掉', () => {
  // 桌宠是无边框置顶窗口，不在 windowManager 里。漏掉 destroy 会剩一个孤儿窗口
  // 让进程活着，用户看到"关不掉的小人"。
  assert.match(
    mainSource,
    /function quitIfLastShellWindowClosed\(\): void \{[\s\S]+?windowManager\.getAll\(\)\.length > 0[\s\S]+?coachPetWindow\?\.destroy\(\)[\s\S]+?app\.quit\(\)/,
  )
  // 顺序有意义：先 destroy 掉 TabManager（它持有 WebContentsView），再判断要不要退出。
  assert.match(mainSource, /win\.on\('closed', \(\) => \{[\s\S]+?tabManager\.destroy\(\)[\s\S]+?quitIfLastShellWindowClosed\(\)/)
})

test('生产构建里 smoke 专用 preload 与 DevTools 都进不来', () => {
  /*
   * RENDERER_DIST 和另外两个 preload 常量是导出的模块级常量，已改成行为断言，
   * 见 mainStartupContract.test.ts。剩下这两处是 createWindowOnce / CoachPetWindow
   * 里的内联表达式，取不到。
   */
  // preload 跑在有 Node 能力的上下文里：少了 STARTUP_SMOKE_MODE 前置判断，
  // 一个环境变量就能让生产构建加载任意本地脚本。两处（shell 窗口与桌宠）都要钉。
  assert.strictEqual(
    mainSource.match(/STARTUP_SMOKE_MODE && process\.env\.ALGO_ELECTRON_SMOKE_PRELOAD_PATH/g)?.length,
    2,
    'shell 窗口与桌宠的 preload 覆盖都必须带 smoke 前置判断',
  )
  // 生产构建里 DevTools 快捷键必须无效，否则渲染进程可被直接调试。
  assert.match(mainSource, /if \(!VITE_DEV_SERVER_URL && !STARTUP_SMOKE_MODE\) return/)
})
