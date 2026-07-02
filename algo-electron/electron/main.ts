import { app, BrowserWindow, ipcMain, Menu, dialog, net, protocol, session, webContents } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { TabManager } from './browser/TabManager'
import { initDb, closeDb, getDb } from './db/connection'
import { SiteRegistry } from './sites/siteRegistry'
import { CookieVault } from './cookies/CookieVault'
import { TrackingService } from './tracking/TrackingService'
import { getDefaultHomeUrl, saveConfig } from './app/config'
import { getRecentProblems, getOverviewStats, upsertProblem, getProblemDetail, deleteProblem } from './db/repositories/problemRepository'
import { getAllSites, getSiteById, createSite, updateSite, toggleSite, deleteSite, seedBuiltinSites, exportSitesConfig, previewImportSites, confirmImportSites, getEnabledSites } from './db/repositories/siteRepository'
import { upsertAccount, updateCurrentRating, updatePeakRating, getAccount, getAccountsByPlatform, getAccountById, upsertRatingHistory, getRatingHistory, computePeakRating } from './db/repositories/accountRepository'
import { getDailyActiveStats, getVisitedTrend, getAcTrend, getSubmissionTrend, getPlatformDistribution, getProblemVisitStats, getTimeline, getLastActiveTime, getRevisitStats, recomputeDailyStats, getStreakDays, getWrongProblems, getUnreviewedProblems, recomputeAllDailyStats } from './db/repositories/statsRepository'
import { fetchCFCurrentRating, fetchCFRatingHistory, formatCFRatingHistory } from './rating/codeforces'
import { resolveNavigateUrl } from './parsers/navigateUrl'
import { parseUrl, setEnabledSitesFetcher } from './parsers/registry'
import { SyncService } from './submissions/syncService'
import { createDefaultSubmissionBatchWriter } from './submissions/createDefaultSubmissionBatchWriter'
import { RealtimeSubmissionService } from './submissions/RealtimeSubmissionService'
import { UserScriptService } from './scripts/UserScriptService'
import { resolveBrowserTitleProblemIdentity } from './parsers/browserTitle'
import { createProblemTitleFallbackScript } from './parsers/problemTitleFallback'
import {
  createNote, getNotesByProblem, getNoteWithContent, updateNoteTitle,
  updateNoteContent, updateNoteType, deleteNote, getNotesByProblemForDelete,
  deleteNotesByProblem, openNotesDir, resolveNoteAssetPath, saveNoteImage, type NoteType
} from './notes/NoteService'
import { exportAIContext, renderContextAsMarkdown } from './ai/contextExporter'
import { getReviewRecommendations } from './ai/recommendations/reviewRecommender'
import { getWeaknessAnalysis } from './ai/recommendations/weaknessAnalyzer'
import { getReviewPlan, renderPlanAsMarkdown } from './ai/recommendations/reviewPlanner'
import { getPeriodSummary, renderSummaryAsMarkdown } from './ai/summary/periodSummary'
import { ensureTodaySnapshot } from './db/repositories/aiContextSnapshotRepository'
import {
  saveAIOutput, getAIOutput, listAIOutputs, deleteAIOutput, updateAIOutput,
  type AIOutputType
} from './db/repositories/aiOutputRepository'
import { STEALTH_SCRIPT } from './browser/stealthScript'
import { getRealtimeAdapterForUrl } from './adapters/registry'

// Chromium 启动开关配置
// 注意：以下开关必须在 app.whenReady() 之前设置

// 1. 禁用 Chromium 124+ 默认启用的 PostQuantumKyber，以防止部分本地代理或防火墙导致 SSL 握手失败 (ERR_CONNECTION_CLOSED)
app.commandLine.appendSwitch('disable-features', 'PostQuantumKyber,TLS13KeyExchangeMLKEM')

// 2. Cloudflare / Turnstile 反检测
// Electron 默认会暴露 navigator.webdriver 等自动化标志，Cloudflare 在页面加载极早期检测这些标志。
// disable-blink-features=AutomationControlled 从 C++ 层面阻止该标志暴露。
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

// 3. 不要启用 ignore-certificate-errors
// 全局禁用证书验证会被 Cloudflare 识别为自动化工具，导致验证通过后仍被退回验证页。
// 如需访问自签名证书站点，请改用 session.setCertificateVerifyProc 针对特定域名处理。

const NOTE_ASSET_SCHEME = 'note-asset'

protocol.registerSchemesAsPrivileged([
  {
    scheme: NOTE_ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
    },
  },
])

// 删除默认菜单栏
Menu.setApplicationMenu(null)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tabManager: TabManager | null
let trackingService: TrackingService | null
let syncService: SyncService | null
let realtimeSubmissionService: RealtimeSubmissionService | null
let userScriptService: UserScriptService | null

function registerNoteAssetProtocol() {
  protocol.handle(NOTE_ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const segments = url.pathname
        .split('/')
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment))
      const [noteId, ...relativeParts] = segments

      if (url.hostname !== 'local' || !noteId || relativeParts.length === 0) {
        return new Response(null, { status: 400 })
      }

      const assetPath = resolveNoteAssetPath(noteId, relativeParts.join('/'))
      if (!assetPath || !fs.existsSync(assetPath)) {
        return new Response(null, { status: 404 })
      }

      return net.fetch(pathToFileURL(assetPath).toString())
    } catch (error) {
      console.warn('[Notes] 读取图片附件失败:', error)
      return new Response(null, { status: 404 })
    }
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // 创建多标签页宿主
  tabManager = new TabManager(win)
  syncService?.setBrowserHost(tabManager)
  realtimeSubmissionService?.attachTabManager(tabManager)

  // 注册 DevTools 快捷键（Ctrl+Shift+I / F12）
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    const isShift = input.shift
    const keyCode = input.key
    // Ctrl+Shift+I 或 F12 打开/关闭 DevTools
    if ((input.control && isShift && keyCode === 'I') || keyCode === 'F12') {
      win?.webContents.toggleDevTools()
    }
  })

  tabManager.setUrlChangeCallback((url) => {
    win?.webContents.send('browser:urlChanged', url)
  })

  // 标题抓取防抖与去重
  const extractionTimers = new Map<string, NodeJS.Timeout[]>()
  const successfulExtractions = new Set<string>()

  const isCodeforcesUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.hostname === 'codeforces.com' || parsed.hostname === 'www.codeforces.com'
    } catch {
      return false
    }
  }

  const updateProblemTitle = (
    url: string,
    title: string | null | undefined,
    source: 'browser-title' | 'dom-fallback',
  ): boolean => {
    if (source === 'browser-title' && isCodeforcesUrl(url)) return false
    const identity = resolveBrowserTitleProblemIdentity(url, title, parseUrl)
    if (!identity) return false
    successfulExtractions.add(url)
    upsertProblem(identity)
    win?.webContents.send('problems:updated')
    return true
  }

  const scheduleTitleExtraction = (url: string) => {
    if (!url || url === 'about:blank') return
    if (successfulExtractions.has(url)) return // 已经抓取成功过，跳过

    // 清除该 URL 之前的定时器
    if (extractionTimers.has(url)) {
      extractionTimers.get(url)?.forEach(clearTimeout)
    }
    const timers: NodeJS.Timeout[] = []

    const extract = () => {
      const title = tabManager?.getTitleForUrl(url)
      if (updateProblemTitle(url, title, 'browser-title')) {
        timers.forEach(clearTimeout)
        extractionTimers.delete(url)
        return
      }

      const script = createProblemTitleFallbackScript(url)
      if (!script) return
      tabManager?.executeScriptOnUrl(url, script)
        .then((fallbackTitle) => {
          if (updateProblemTitle(url, typeof fallbackTitle === 'string' ? fallbackTitle : null, 'dom-fallback')) {
            timers.forEach(clearTimeout)
            extractionTimers.delete(url)
          }
        })
        .catch(() => {})
    }

    timers.push(setTimeout(extract, 2000))
    timers.push(setTimeout(extract, 5000)) // 减少一次调用，改为 5s
    if (url.includes('pintia.cn') || url.includes('vjudge.net/contest')) {
      timers.push(setTimeout(extract, 8000))
    }
    extractionTimers.set(url, timers)
  }

  tabManager.setNavigateCallback((url) => {
    const identity = trackingService?.handleNavigation(url)
    if (identity) {
      win?.webContents.send('problem:detected', identity)
      win?.webContents.send('problems:updated')
      scheduleTitleExtraction(url)
    }
  })

  tabManager.setTitleChangeCallback((title, url) => {
    if (!url) return

    // CF Gym 题目页会显示 "Illegal contest ID"，自动跳 attachments
    if (title.includes('Illegal contest ID') && url.includes('codeforces.com')) {
      const match = url.match(/codeforces\.com\/(?:gym|problemset\/problem|contest)\/(\d+)/)
      if (match) {
        tabManager?.navigate(`https://codeforces.com/gym/${match[1]}/attachments`)
        return
      }
    }

    if (updateProblemTitle(url, title, 'browser-title')) return

    scheduleTitleExtraction(url)
  })

  tabManager.addActiveTabChangeListener((url) => {
    if (!url || url === 'about:blank') return
    const title = tabManager?.getTitleForUrl(url)
    if (updateProblemTitle(url, title, 'browser-title')) return
    scheduleTitleExtraction(url)
  })

  tabManager.setTabListChangedCallback((tabs) => {
    win?.webContents.send('tab:listChanged', tabs)
  })

  tabManager.setPageLoadedCallback(async (url) => {
    console.log('[UserScript] Page loaded:', url)
    if (!userScriptService || !tabManager) {
      console.log('[UserScript] SKIP: service or host is null')
      return
    }
    const entries = userScriptService.getMatchingScriptsWithMeta(url)
    console.log('[UserScript] Matching scripts:', entries.length)

    for (const { script, requires, resources } of entries) {
      console.log('[UserScript] Injecting:', script.name, 'requires:', requires.length, 'resources:', resources.length, 'code length:', script.code?.length ?? 0)
      try {
        // Step 1: Inject GM_* polyfills + resource data onto window
        const resourceMap: Record<string, string> = {}
        for (const res of resources) {
          resourceMap[res.name] = res.url
        }

        const polyfills = `
          window.unsafeWindow = window;
          window.GM_addStyle = (css) => {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
          };
          window.GM_info = {
            script: {
              name: ${JSON.stringify(script.name)},
              version: ${JSON.stringify(script.version || '1.0')}
            }
          };
          window.GM_getValue = (key, def) => {
            try {
              const val = localStorage.getItem('GM_' + key);
              return val !== null ? JSON.parse(val) : def;
            } catch { return def; }
          };
          window.GM_setValue = (key, val) => {
            localStorage.setItem('GM_' + key, JSON.stringify(val));
          };
          window.GM_deleteValue = (key) => {
            localStorage.removeItem('GM_' + key);
          };
          window.GM_listValues = () => {
            const keys = [];
            for(let i = 0; i < localStorage.length; i++){
              const key = localStorage.key(i);
              if(key && key.startsWith('GM_')) keys.push(key.substring(3));
            }
            return keys;
          };
          window.GM_xmlhttpRequest = (details) => {
            const controller = new AbortController();
            fetch(details.url, {
              method: details.method || 'GET',
              headers: details.headers,
              body: details.data,
              signal: controller.signal
            }).then(async r => {
              const text = await r.text();
              const resp = { status: r.status, statusText: r.statusText, responseText: text, responseHeaders: '' };
              if(details.onload) details.onload(resp);
            }).catch(e => {
              if(details.onerror) details.onerror(e);
            });
            return { abort: () => controller.abort() };
          };
          window.GM_setClipboard = (text) => {
            navigator.clipboard && navigator.clipboard.writeText(text);
          };
          window.__GM_RESOURCE_URLS__ = ${JSON.stringify(resourceMap)};
          window.__GM_RESOURCE_CACHE__ = window.__GM_RESOURCE_CACHE__ || {};
          window.GM_getResourceText = (name) => {
            if(window.__GM_RESOURCE_CACHE__[name] !== undefined) return window.__GM_RESOURCE_CACHE__[name];
            return '';
          };
          window.GM_getResourceURL = (name) => {
            return window.__GM_RESOURCE_URLS__[name] || '';
          };
          void 0;
        `
        await tabManager.executeScript(polyfills)
        console.log('[UserScript] Polyfills injected for:', script.name)

        // Step 2: Pre-fetch @resource data so GM_getResourceText works
        if (resources.length > 0) {
          const fetchResourcesCode = `
            (async () => {
              const urls = window.__GM_RESOURCE_URLS__;
              for (const [name, url] of Object.entries(urls)) {
                try {
                  const resp = await fetch(url);
                  window.__GM_RESOURCE_CACHE__[name] = await resp.text();
                } catch(e) {
                  console.warn('[UserScript] Failed to fetch resource:', name, e);
                  window.__GM_RESOURCE_CACHE__[name] = '';
                }
              }
              return void 0;
            })()
          `
          await tabManager.executeScript(fetchResourcesCode)
          console.log('[UserScript] Resources fetched for:', script.name)
        }

        // Step 3: Load @require libraries sequentially via <script> tags
        if (requires.length > 0) {
          const loadRequiresCode = `
            (async () => {
              const urls = ${JSON.stringify(requires)};
              for (const url of urls) {
                await new Promise((resolve, reject) => {
                  const s = document.createElement('script');
                  s.src = url;
                  s.onload = resolve;
                  s.onerror = (e) => { console.warn('[UserScript] Failed to load require:', url, e); resolve(e); };
                  (document.head || document.documentElement).appendChild(s);
                });
              }
              return void 0;
            })()
          `
          await tabManager.executeScript(loadRequiresCode)
          console.log('[UserScript] Requires loaded for:', script.name)
        }

        // Step 4: Execute the actual user script
        await tabManager.executeScript(script.code + '\n; void 0;')
        console.log('[UserScript] Script executed OK:', script.name)

      } catch (e: any) {
        console.error('[UserScript Failed]', script.name, e?.message ?? e)
      }
    }
  })

  win.webContents.on('did-finish-load', () => {
    if (tabManager) {
      win?.webContents.send('browser:urlChanged', tabManager.getUrl())
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.once('ready-to-show', () => {
    win?.show()
    tabManager?.warmup()
  })

  win.on('maximize', () => {
    win?.webContents.send('window:maximized', true)
  })

  win.on('unmaximize', () => {
    win?.webContents.send('window:maximized', false)
  })

  win.on('closed', () => {
    trackingService?.endCurrentVisit()
    tabManager?.destroy()
    tabManager = null
    win = null
  })
}

// --- IPC ---

ipcMain.handle('tab:create', (_event, url?: string) => {
  return tabManager?.createTab(url) ?? null
})

ipcMain.on('tab:close', (_event, tabId: string) => {
  tabManager?.closeTab(tabId)
})

ipcMain.on('tab:switch', (_event, tabId: string) => {
  tabManager?.switchTab(tabId)
})

ipcMain.on('tab:detach', (_event, tabId: string) => {
  tabManager?.detachTab(tabId)
})

ipcMain.handle('tab:getList', () => {
  return tabManager?.getTabList() ?? []
})

ipcMain.on('browser:navigate', (_event, url: string) => {
  const resolvedUrl = resolveNavigateUrl(url)
  // 如果链接被重定向（如教练题跳附件页），确保原链接仍被记录访问时间
  if (resolvedUrl !== url) {
    const identity = trackingService?.handleNavigation(url)
    if (identity) {
      win?.webContents.send('problem:detected', identity)
      win?.webContents.send('problems:updated')
    }
  }
  tabManager?.navigate(resolvedUrl)
})

ipcMain.on('browser:goBack', () => {
  tabManager?.goBack()
})

ipcMain.on('browser:goForward', () => {
  tabManager?.goForward()
})

ipcMain.on('browser:reload', () => {
  tabManager?.reload()
})

ipcMain.on('browser:goHome', () => {
  tabManager?.hideView()
})

ipcMain.on('browser:hideView', () => {
  tabManager?.hideView()
})

ipcMain.on('browser:showView', () => {
  tabManager?.showView()
})

ipcMain.on('browser:setSidebarWidth', (_event, width: number) => {
  tabManager?.setLeftOffset(width)
})

ipcMain.handle('browser:capturePreview', async () => {
  return tabManager?.capturePreview() ?? null
})

ipcMain.on('window:minimize', () => {
  win?.minimize()
})

ipcMain.on('window:maximize', () => {
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})

ipcMain.on('window:close', () => {
  win?.close()
})

ipcMain.handle('window:isMaximized', () => {
  return win?.isMaximized() ?? false
})

ipcMain.handle('problem:listRecent', (_event, limit?: number, platform?: string, status?: string) => {
  return getRecentProblems(limit, platform, status)
})

ipcMain.handle('problem:getDetail', (_event, problemId: string) => {
  return getProblemDetail(problemId)
})

ipcMain.handle('problem:delete', (_event, problemId: string) => {
  const ok = deleteProblem(problemId)
  if (ok) {
    win?.webContents.send('problems:updated')
  }
  return ok
})

// --- 笔记（本地题解 Markdown） ---

ipcMain.handle('notes:listByProblem', (_event, problemId: string) => {
  return getNotesByProblem(problemId)
})

ipcMain.handle('notes:get', (_event, noteId: string) => {
  return getNoteWithContent(noteId)
})

ipcMain.handle('notes:create', (_event, problemId: string | null, title: string, content: string | null, noteType: NoteType) => {
  const note = createNote({ problem_id: problemId, title, content: content ?? undefined, note_type: noteType })
  win?.webContents.send('problems:updated')
  return note
})

ipcMain.handle('notes:updateTitle', (_event, noteId: string, title: string) => {
  return updateNoteTitle(noteId, title)
})

ipcMain.handle('notes:updateContent', (_event, noteId: string, content: string) => {
  return updateNoteContent(noteId, content)
})

ipcMain.handle('notes:saveImage', (_event, noteId: string, fileName: string, mimeType: string, data: ArrayBuffer | Uint8Array) => {
  return saveNoteImage(noteId, fileName, mimeType, data)
})

ipcMain.handle('notes:updateType', (_event, noteId: string, noteType: NoteType) => {
  return updateNoteType(noteId, noteType)
})

ipcMain.handle('notes:delete', (_event, noteId: string) => {
  return deleteNote(noteId)
})

ipcMain.handle('notes:getForDelete', (_event, problemId: string) => {
  // 删除题目前获取关联笔记列表，供前端确认
  return getNotesByProblemForDelete(problemId)
})

ipcMain.handle('notes:deleteByProblem', (_event, problemId: string) => {
  // 用户确认后删除题目关联的所有笔记文件
  return deleteNotesByProblem(problemId)
})

ipcMain.handle('notes:openDir', async () => {
  const dir = openNotesDir()
  const { shell } = await import('electron')
  shell.openPath(dir)
})

// --- P6-004: AI 上下文导出层 ---

ipcMain.handle('ai:exportContext', () => {
  return exportAIContext()
})

ipcMain.handle('ai:exportContextMarkdown', () => {
  return renderContextAsMarkdown(exportAIContext())
})

// --- P6-005: 错题复习建议（本地规则引擎） ---

ipcMain.handle('ai:getReviewRecommendations', (_event, limit?: number) => {
  return getReviewRecommendations(limit ?? 10)
})

// --- P6-006: 薄弱标签分析（本地规则引擎） ---

ipcMain.handle('ai:getWeaknessAnalysis', (_event, limit?: number) => {
  return getWeaknessAnalysis(limit ?? 10)
})

// --- P6-007: 阶段学习总结（本地规则引擎） ---
ipcMain.handle('ai:getPeriodSummary', (_event, startDate: string, endDate: string) => {
  return getPeriodSummary({ start_date: startDate, end_date: endDate })
})

ipcMain.handle('ai:getPeriodSummaryMarkdown', (_event, startDate: string, endDate: string) => {
  const summary = getPeriodSummary({ start_date: startDate, end_date: endDate })
  return renderSummaryAsMarkdown(summary)
})

// --- P6-008: 复习计划生成（本地规则引擎） ---
ipcMain.handle('ai:getReviewPlan', (_event, planDays?: number) => {
  return getReviewPlan(planDays ?? 7)
})

ipcMain.handle('ai:getReviewPlanMarkdown', (_event, planDays?: number) => {
  const plan = getReviewPlan(planDays ?? 7)
  return renderPlanAsMarkdown(plan)
})

// --- P6-009: AI 输出本地保存 ---
ipcMain.handle('ai:saveOutput', (_event, input: {
  output_type: AIOutputType
  title: string
  content: string
  content_markdown?: string
  input_summary?: Record<string, any>
  source_refs?: Record<string, any>
  model_info?: Record<string, any>
}) => {
  return saveAIOutput(input)
})

ipcMain.handle('ai:getOutput', (_event, id: string) => {
  return getAIOutput(id)
})

ipcMain.handle('ai:listOutputs', (_event, outputType?: AIOutputType, limit?: number) => {
  return listAIOutputs(outputType, limit ?? 20)
})

ipcMain.handle('ai:deleteOutput', (_event, id: string) => {
  return deleteAIOutput(id)
})

ipcMain.handle('ai:updateOutput', (_event, id: string, updates: {
  title?: string
  content?: string
  content_markdown?: string
}) => {
  return updateAIOutput(id, updates)
})

ipcMain.handle('stats:getOverview', () => {
  return getOverviewStats()
})

ipcMain.handle('stats:getDailyActive', (_event, days?: number) => {
  return getDailyActiveStats(days)
})

ipcMain.handle('stats:getVisitedTrend', (_event, days?: number) => {
  return getVisitedTrend(days)
})

ipcMain.handle('stats:getAcTrend', (_event, days?: number) => {
  return getAcTrend(days)
})

ipcMain.handle('stats:getSubmissionTrend', (_event, days?: number) => {
  return getSubmissionTrend(days)
})

ipcMain.handle('stats:getPlatformDistribution', () => {
  return getPlatformDistribution()
})

ipcMain.handle('stats:getProblemVisitStats', (_event, problemId: string) => {
  return getProblemVisitStats(problemId)
})

ipcMain.handle('stats:getTimeline', (_event, limit?: number) => {
  return getTimeline(limit)
})

ipcMain.handle('stats:getLastActiveTime', () => {
  return getLastActiveTime()
})

ipcMain.handle('stats:getRevisitStats', (_event, limit?: number) => {
  return getRevisitStats(limit)
})

ipcMain.handle('stats:recomputeDaily', (_event, date?: string) => {
  recomputeDailyStats(date)
  return true
})

ipcMain.handle('stats:getStreakDays', () => {
  return getStreakDays()
})

ipcMain.handle('stats:getWrongProblems', (_event, limit?: number) => {
  return getWrongProblems(limit)
})

ipcMain.handle('stats:getUnreviewed', (_event, days?: number, limit?: number) => {
  return getUnreviewedProblems(days, limit)
})

ipcMain.handle('stats:recomputeAll', () => {
  return recomputeAllDailyStats()
})

ipcMain.handle('config:getDefaultHomeUrl', () => {
  return getDefaultHomeUrl()
})

ipcMain.on('config:setDefaultHomeUrl', (_event, url: string) => {
  saveConfig({ defaultHomeUrl: url })
})

// --- Rating ---

ipcMain.handle('rating:bindHandle', (_event, platform: string, handle: string) => {
  const id = upsertAccount(platform, handle)
  return { id, handle }
})

ipcMain.handle('rating:getAccount', (_event, platform: string, handle: string) => {
  return getAccount(platform, handle)
})

ipcMain.handle('rating:getAccounts', (_event, platform: string) => {
  return getAccountsByPlatform(platform)
})

ipcMain.handle('rating:syncCodeforces', async (_event, handle: string) => {
  try {
    // 确保账号存在
    const accountId = upsertAccount('codeforces', handle)

    // 同步当前 Rating
    const info = await fetchCFCurrentRating(handle)
    if (info) {
      updateCurrentRating(accountId, info.rating)
    }

    // 同步 Rating 历史
    const history = await fetchCFRatingHistory(handle)
    const formatted = formatCFRatingHistory(history)
    let inserted = 0
    for (const h of formatted) {
      const isNew = upsertRatingHistory({ accountId, platform: 'codeforces', ...h })
      if (isNew) inserted++
    }

    // 计算 peak rating
    const peak = computePeakRating(accountId)
    if (peak) updatePeakRating(accountId, peak)

    return { success: true, historyCount: history.length, inserted, peak }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('rating:getHistory', (_event, accountId: string) => {
  if (!getAccountById(accountId)) return []
  return getRatingHistory(accountId)
})

ipcMain.handle('rating:getCodeforcesAccount', async () => {
  const accounts = getAccountsByPlatform('codeforces')
  return accounts.length > 0 ? accounts[0] : null
})

ipcMain.handle('rating:getContestResults', (_event, accountId: string) => {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM contest_results WHERE account_id = ? ORDER BY contest_at DESC LIMIT 20
  `).all(accountId) as any[]
})

// --- 站点管理 ---

ipcMain.handle('sites:getAll', () => {
  return getAllSites()
})

ipcMain.handle('sites:getById', (_event, id: string) => {
  return getSiteById(id)
})

ipcMain.handle('sites:create', (_event, data: any) => {
  return createSite(data)
})

ipcMain.handle('sites:update', (_event, id: string, data: any) => {
  return updateSite(id, data)
})

ipcMain.handle('sites:toggle', (_event, id: string, enabled: boolean) => {
  return toggleSite(id, enabled)
})

ipcMain.handle('sites:delete', (_event, id: string) => {
  return deleteSite(id)
})

ipcMain.handle('sites:exportConfig', async () => {
  try {
    const result = await dialog.showSaveDialog(win!, {
      title: '导出站点配置',
      defaultPath: 'algo-sites-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, error: '取消导出' }

    const data = exportSitesConfig()
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true, path: result.filePath, count: data.sites.length }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('sites:importConfig', async () => {
  try {
    const result = await dialog.showOpenDialog(win!, {
      title: '导入站点配置',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false, error: '取消导入' }

    const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
    const data = JSON.parse(raw)
    const preview = previewImportSites(data)
    return { success: true, preview }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('sites:confirmImport', (_event, sites: any[], overwriteIds: string[]) => {
  try {
    const result = confirmImportSites(sites, overwriteIds)
    win?.webContents.send('problems:updated')
    return { success: true, ...result }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('submissions:syncCodeforces', async (_event, handle: string) => {
  if (!syncService) return { platform: 'codeforces', fetched: 0, inserted: 0, error: 'SyncService not ready' }
  return syncService.syncCodeforces(handle)
})

ipcMain.handle('submissions:syncVjudge', async () => {
  if (!syncService) return { platform: 'vjudge', fetched: 0, inserted: 0, error: 'SyncService not ready' }
  return syncService.syncVjudge()
})

ipcMain.handle('submissions:syncCurrentPage', async () => {
  if (!syncService) return { platform: 'unknown', fetched: 0, inserted: 0, error: 'SyncService not ready' }
  return syncService.syncCurrentPage()
})

// --- App 生命周期 ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在应用真正退出前清理资源，覆盖 macOS 关窗不退出、直关窗口等场景
app.on('before-quit', () => {
  try { trackingService?.endCurrentVisit() } catch { /* ignore */ }
  try { closeDb() } catch { /* ignore */ }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // 设置真实 Chrome User-Agent，去除 Electron 标识
  // 修复 Cloudflare 等反爬验证将 Electron 识别为自动化工具的问题
  const chromeVersion = process.versions.chrome
  const realUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  app.userAgentFallback = realUA
  session.defaultSession.setUserAgent(realUA)
  const ojSession = session.fromPartition('persist:oj-main')
  ojSession.setUserAgent(realUA)

  // 通过 webRequest 拦截 HTML 响应，在 <head> 最前面注入反检测脚本
  // 确保脚本在 Cloudflare / Turnstile 之前执行（比 did-finish-load 早得多）

  // 添加 CORS 头，使用户脚本的 GM_xmlhttpRequest (fetch) 不受跨域限制
  // 模拟油猴扩展的跨域权限，同时保持 webSecurity=true（不破坏 Cloudflare 验证）
  // 注意：必须先移除服务器已有的 CORS 头，否则会出现重复头导致浏览器报错
  const corsHeadersToAdd = {
    'access-control-allow-origin': ['*'],
    'access-control-allow-methods': ['GET, POST, PUT, DELETE, OPTIONS, PATCH'],
    'access-control-allow-headers': ['*'],
    'access-control-expose-headers': ['*'],
    'access-control-max-age': ['86400'],
  }

  ojSession.webRequest.onHeadersReceived((details, callback) => {
    // mainFrame HTML 请求：标记需要注入 stealth script（供 onResponseStarted 使用）
    if (details.resourceType === 'mainFrame') {
      const ct = details.responseHeaders?.['content-type']?.[0] || details.responseHeaders?.['Content-Type']?.[0]
      if (ct && ct.includes('text/html')) {
        ;(details as any)._needsStealth = true
      }
      // 主帧导航不涉及 CORS，不修改响应头，避免破坏 Content-Type 等头导致下载窗口
      callback({})
      return
    }

    // 只对 XHR/fetch 请求和 OPTIONS 预检请求添加 CORS 头
    // 其他资源请求（script/stylesheet/image/font 等）不修改响应头
    if (details.resourceType !== 'xhr' && details.method !== 'OPTIONS') {
      callback({})
      return
    }

    // 如果服务器已返回 access-control-allow-credentials: true，
    // 说明该请求需要 cookie 认证（如 PTA API），保留服务器原始 CORS 头不动
    // 避免移除 credentials 后导致认证失败
    const hasCredentials = Object.entries(details.responseHeaders || {}).some(
      ([key, value]) => key.toLowerCase() === 'access-control-allow-credentials' && value[0] === 'true'
    )
    if (hasCredentials) {
      callback({})
      return
    }

    // 复制原始响应头，移除已有的 CORS 头（不区分大小写），避免重复
    const headers: Record<string, string[]> = {}
    const corsKeys = ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-expose-headers', 'access-control-max-age']
    for (const [key, value] of Object.entries(details.responseHeaders || {})) {
      if (!corsKeys.includes(key.toLowerCase())) {
        headers[key] = value as string[]
      }
    }
    Object.assign(headers, corsHeadersToAdd)

    if (details.method === 'OPTIONS') {
      callback({ responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' })
      return
    }

    callback({ responseHeaders: headers })
  })
  ojSession.webRequest.onResponseStarted((details) => {
    const wc = details.webContentsId ? webContents.fromId(details.webContentsId) : undefined
    if (details.resourceType === 'mainFrame') {
      const adapter = getRealtimeAdapterForUrl(details.url)
      const site = adapter ? getSiteById(adapter.id) : null
      const hookScript = adapter && (!site || site.enabled) ? adapter.injectHookScript?.() : undefined
      if (hookScript) {
        // Some OJ editors cache fetch/XMLHttpRequest during module startup. Injecting
        // here lets realtime hooks wrap request APIs before those editor bundles run.
        const earlyRealtimeScript = `try { window.__ALGO_TOP_PAGE_URL = ${JSON.stringify(details.url)}; } catch (_) {}\n${hookScript}`
        wc?.executeJavaScript(earlyRealtimeScript, true).catch(() => {})
      }
    }

    if ((details as any)._needsStealth) {
      // 通过 executeJavaScript 在页面开始加载时立即注入（比在 did-finish-load 早）
      // 注意：此时页面可能还没创建 window 对象，需要用 requestAnimationFrame 等待
      const earlyScript = `
        if (typeof navigator !== 'undefined') {
          ${STEALTH_SCRIPT}
        } else {
          (function wait() {
            if (typeof navigator !== 'undefined') { ${STEALTH_SCRIPT} }
            else { requestAnimationFrame(wait) }
          })()
        }
      `
      wc?.executeJavaScript(earlyScript, true).catch(() => {})
    }
  })

  registerNoteAssetProtocol()
  initDb()
  seedBuiltinSites()
  setEnabledSitesFetcher(getEnabledSites)
  new SiteRegistry()
  new CookieVault()
  trackingService = new TrackingService()
  syncService = new SyncService({
    batchWriter: createDefaultSubmissionBatchWriter(),
    findNowcoderProblemBySearch: (search) => {
      const problem = getDb().prepare(
        "SELECT platform_problem_id FROM problems WHERE platform = 'nowcoder' AND platform_problem_id LIKE ?"
      ).get(`%${search}%`) as { platform_problem_id: string } | undefined
      return problem?.platform_problem_id
    },
  })
  realtimeSubmissionService = new RealtimeSubmissionService(() => win)
  realtimeSubmissionService.registerIpc()
  userScriptService = new UserScriptService()
  
  // 智能预连接：基于最近 7 天访问记录，只预连接用户实际使用的站点
  // 避免盲目预连不可达站点（如部分网络环境下的 acwing）导致超时和错误日志
  try {
    const db = getDb()
    const cutoffDate = new Date(Date.now() - 7 * 86400000)
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`
    const recentPlatforms = db.prepare(`
      SELECT platform, COUNT(*) as cnt
      FROM problem_visits
      WHERE entered_at >= ?
      GROUP BY platform
      ORDER BY cnt DESC
      LIMIT 3
    `).all(cutoff) as { platform: string; cnt: number }[]

    for (const { platform } of recentPlatforms) {
      const site = getSiteById(platform)
      if (site?.enabled && site.homeUrl) {
        try {
          const origin = new URL(site.homeUrl).origin
          session.defaultSession.preconnect({ url: origin, numSockets: 1 })
        } catch { /* invalid url */ }
      }
    }
  } catch { /* ignore */ }

  createWindow()

  // 每日首次启动时生成 AI 上下文快照存库（供阶段总结/复习计划等 AI 模块消费）
  // 失败不阻塞启动，仅记录日志
  try {
    ensureTodaySnapshot()
  } catch (err) {
    console.error('[AI] 每日快照生成失败:', err)
  }
})
