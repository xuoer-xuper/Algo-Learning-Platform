/**
 * Coach 阶段 4 数据访问（renderer 侧）。
 *
 * 与 problemsApi / analyticsApi 一致：薄封装 window.electronAPI，
 * 不在 renderer 直接访问 SQLite，全部走 IPC。
 */

/** 单题时间轴复盘数据（Task 18） */
export function loadProblemTimeline(
  problemId: string,
): Promise<ProblemTimelineData | null> {
  return window.electronAPI.coachGetProblemTimeline(problemId)
}

/** 干预效果指标原始数据 bundle（Task 19） */
export function loadMetricsBundle(): Promise<CoachMetricsBundle | null> {
  return window.electronAPI.coachGetMetricsBundle()
}
