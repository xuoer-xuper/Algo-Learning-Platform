import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, type IpcChannel } from '../../src/shared/constants/channels'

/**
 * IPC channel 值快照。
 *
 * `IPC_CHANNELS` 收口（阶段 2 R1）把散落在 electron/ 各处的 channel 字面量换成共享
 * 常量；这份快照在动手**之前**用 grep 按 `ipcMain.(handle|on)`、`ipcRenderer.
 * (invoke|send|on|off)`、`.(send|sendToAll)` 与既有常量定义四个口径实测得到
 * （174 个调用点字面量 + 4 个原本就提取成常量的内部 channel：`oj-submission:*`、
 * `userscript-runtime:*`）。它钉住的是**值**：重构只准改引用方式，不准改任何一个
 * 字符串——bundle 与主进程可能来自不同次构建，值一变就是静默失联。
 *
 * 这也是值清单的闭集断言：常量表里多一个（未上线的新 channel）或少一个（误删）都会
 * 在这里红，新增 channel 必须连同快照一起改，让"channel 集合变了"成为一次显式审查。
 */
const PINNED_CHANNELS: readonly IpcChannel[] = [
  'ai:deleteOutput',
  'ai:exportContext',
  'ai:exportContextMarkdown',
  'ai:getOutput',
  'ai:getPeriodSummary',
  'ai:getPeriodSummaryMarkdown',
  'ai:getReviewPlan',
  'ai:getReviewPlanMarkdown',
  'ai:getReviewRecommendations',
  'ai:getWeaknessAnalysis',
  'ai:listOutputs',
  'ai:saveOutput',
  'ai:updateOutput',
  'backup:confirmLearningDataImport',
  'backup:createDatabaseBackup',
  'backup:exportLearningData',
  'backup:previewLearningDataImport',
  'browser:cancelUserScriptInstall',
  'browser:findInPage',
  'browser:findInPageResult',
  'browser:getDiagnostics',
  'browser:getUserScriptInstall',
  'browser:goBack',
  'browser:goForward',
  'browser:goHome',
  'browser:navigate',
  'browser:omniboxSuggest',
  'browser:reload',
  'browser:setDownloadNoticeVisible',
  'browser:setErrorNoticeVisible',
  'browser:setOmniboxOpen',
  'browser:setSidebarWidth',
  'browser:setZoom',
  'browser:showAppMenu',
  'browser:showShellContextMenu',
  'browser:showTabContextMenu',
  'browser:urlChanged',
  'browser:zoomChanged',
  'coach:chat',
  'coach:configChanged',
  'coach:contestModeChanged',
  'coach:dismissBubble',
  'coach:dismissDisclaimer',
  'coach:dismissHint',
  'coach:endDrag',
  'coach:exportAuditLog',
  'coach:feedback',
  'coach:getConfig',
  'coach:getLlmConfig',
  'coach:getMetrics',
  'coach:getMetricsBundle',
  'coach:getPetState',
  'coach:getProblemTimeline',
  'coach:getSession',
  'coach:getSessionHistory',
  'coach:getState',
  'coach:getWorkArea',
  'coach:listEvents',
  'coach:listInterventions',
  'coach:petClick',
  'coach:petStateChanged',
  'coach:requestHint',
  'coach:resetPosition',
  'coach:saveConfig',
  'coach:saveLlmApiKey',
  'coach:saveLlmConfig',
  'coach:setPetState',
  'coach:showBubble',
  'coach:startDrag',
  'coach:testHint',
  'coach:testLlmConnection',
  'coach:toggleIgnoreMouseEvents',
  'coach:triggerHint',
  'config:getHomeShortcuts',
  'config:getSearchEngine',
  'config:getTheme',
  'config:setSearchEngine',
  'config:setTheme',
  'cookies:getDomainSummary',
  'cookies:getSiteSummary',
  'credentials:autofillPrompt',
  'credentials:autofillRespond',
  'credentials:capturePrompt',
  'credentials:captureRespond',
  'credentials:captureResult',
  'credentials:delete',
  'credentials:list',
  'credentials:rename',
  'download:result',
  'log-to-main',
  'notes:create',
  'notes:delete',
  'notes:deleteByProblem',
  'notes:get',
  'notes:getForDelete',
  'notes:listByProblem',
  'notes:openDir',
  'notes:saveImage',
  'notes:updateContent',
  'notes:updateTitle',
  'notes:updateType',
  'oj-credentials:capture',
  'oj-credentials:fill',
  'oj-submission:detected',
  'oj-submission:getDocumentToken',
  'problem:delete',
  'problem:getDetail',
  'problem:listRecent',
  'problems:updated',
  'rating:bindHandle',
  'rating:getAccount',
  'rating:getAccounts',
  'rating:getCodeforcesAccount',
  'rating:getContestResults',
  'rating:getHistory',
  'rating:syncCodeforces',
  'realtimeSubmission:getStatus',
  'scripts:cancelRemoteInstall',
  'scripts:checkUpdates',
  'scripts:confirmRemoteInstall',
  'scripts:delete',
  'scripts:getAll',
  'scripts:getCode',
  'scripts:getRemoteInstallPreview',
  'scripts:importFile',
  'scripts:openEditor',
  'scripts:openFolder',
  'scripts:save',
  'scripts:toggle',
  'sites:confirmImport',
  'sites:create',
  'sites:delete',
  'sites:exportConfig',
  'sites:getAll',
  'sites:getById',
  'sites:importConfig',
  'sites:toggle',
  'stats:getAcTrend',
  'stats:getDailyActive',
  'stats:getLastActiveTime',
  'stats:getOverview',
  'stats:getPlatformDistribution',
  'stats:getProblemVisitStats',
  'stats:getRevisitStats',
  'stats:getStreakDays',
  'stats:getSubmissionTrend',
  'stats:getTimeline',
  'stats:getUnreviewed',
  'stats:getVisitedTrend',
  'stats:getWrongProblems',
  'stats:recomputeAll',
  'stats:recomputeDaily',
  'submissions:syncCodeforces',
  'submissions:syncCurrentPage',
  'submissions:syncVjudge',
  'tab:close',
  'tab:create',
  'tab:dismissUnresponsive',
  'tab:finishDrag',
  'tab:getList',
  'tab:listChanged',
  'tab:moveToNewWindow',
  'tab:openInternal',
  'tab:reload',
  'tab:reopenClosed',
  'tab:reorder',
  'tab:switch',
  'ui:command',
  'userscript-runtime:init',
  'userscript-runtime:port',
  'userscript:getHostPermissionPrompt',
  'userscript:hostPermissionRequested',
  'userscript:respondHostPermission',
  'window:close',
  'window:isMaximized',
  'window:maximize',
  'window:maximized',
  'window:minimize',
]

/** 深度优先展开嵌套的 channel 分组，只收集字符串叶子。 */
function flattenChannels(node: Record<string, unknown>): string[] {
  return Object.values(node).flatMap((value) =>
    typeof value === 'string' ? [value] : flattenChannels(value as Record<string, unknown>),
  )
}

const declaredChannels = flattenChannels(IPC_CHANNELS)
const declaredSorted = [...declaredChannels].sort()

// 编译期联动：快照的每个元素都必须是 IpcChannel 闭集的成员。若有值拼错或被删，
// 这一行先于运行时断言报错。见上方 PINNED_CHANNELS 的显式类型标注。
const pinnedTypecheck: readonly IpcChannel[] = PINNED_CHANNELS
void pinnedTypecheck

describe('IPC_CHANNELS 值快照', () => {
  it('常量值集合与重构前的实测快照逐字节一致', () => {
    expect(declaredSorted).toEqual([...PINNED_CHANNELS].sort())
  })

  it('channel 总数与快照一致（当前 178）', () => {
    expect(declaredChannels).toHaveLength(PINNED_CHANNELS.length)
    expect(declaredChannels).toHaveLength(178)
  })

  it('同一个 channel 只声明一次', () => {
    expect(new Set(declaredChannels).size).toBe(declaredChannels.length)
  })

  it('快照保持排序，后续增删走一次可审查的 diff', () => {
    expect([...PINNED_CHANNELS].sort()).toEqual([...PINNED_CHANNELS])
  })
})
