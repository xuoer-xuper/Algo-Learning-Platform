import { getSnapshotByDate } from '../../db/repositories/aiContextSnapshotRepository'
import type { AIContextSnapshot } from '../../db/repositories/aiContextSnapshotRepository'
import type { AggregatedPeriodStats } from './periodSummaryTypes'

export type PeriodSnapshotMeta = Omit<AIContextSnapshot, 'context_json'>

export function getSnapshotsInPeriod(
  snapshots: PeriodSnapshotMeta[],
  startDate: string,
  endDate: string,
): PeriodSnapshotMeta[] {
  return snapshots.filter(snapshot => snapshot.snapshot_date >= startDate && snapshot.snapshot_date <= endDate)
}

export function aggregateFromSnapshots(snapshots: PeriodSnapshotMeta[]): AggregatedPeriodStats {
  let totalVisited = 0
  let totalSolved = 0
  let totalSubmissions = 0
  let totalAc = 0
  let activeDays = 0
  let totalActiveSeconds = 0
  const platformMap = new Map<string, number>()
  const weakTagsSet = new Set<string>()

  for (const snapshot of snapshots) {
    const contextSnapshot = getSnapshotByDate(snapshot.snapshot_date)
    if (!contextSnapshot) continue
    const data = contextSnapshot.context

    if (data.trends?.daily_stats) {
      for (const dailyStats of data.trends.daily_stats) {
        if (dailyStats.local_day === snapshot.snapshot_date) {
          if (dailyStats.active_seconds > 0 || dailyStats.visited > 0) activeDays++
          totalActiveSeconds += dailyStats.active_seconds || 0
          totalVisited += dailyStats.visited || 0
          totalSolved += dailyStats.solved || 0
          totalSubmissions += dailyStats.submissions || 0
          totalAc += dailyStats.ac || 0
        }
      }
    }
  }

  // listSnapshots returns DESC order; the first in-period snapshot is the period-end snapshot.
  if (snapshots.length > 0) {
    const latestSnapshot = getSnapshotByDate(snapshots[0].snapshot_date)
    if (latestSnapshot) {
      const latestData = latestSnapshot.context

      if (latestData.trends?.platform_distribution) {
        for (const platform of latestData.trends.platform_distribution) {
          platformMap.set(platform.platform, platform.count)
        }
      }

      if (latestData.tag_stats) {
        for (const tag of latestData.tag_stats) {
          if (tag.ac_rate < 70 && tag.total >= 2) {
            weakTagsSet.add(tag.tag)
          }
        }
      }
    }
  }

  return {
    totalVisited,
    totalSolved,
    totalSubmissions,
    totalAc,
    activeDays,
    totalActiveSeconds,
    avgDailyMinutes: snapshots.length > 0 ? Math.round(totalActiveSeconds / snapshots.length / 60) : 0,
    platformDistribution: Array.from(platformMap.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count),
    weakTags: Array.from(weakTagsSet),
  }
}
