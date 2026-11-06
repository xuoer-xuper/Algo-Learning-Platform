import { session } from 'electron'
import { getDb } from '../db/connection'
import { getSiteById } from '../db/repositories/siteRepository'
import { localDayBounds, nowMillis, shiftLocalDay, toLocalDay } from '../shared/time'

export function preconnectRecentSiteOrigins(): void {
  try {
    const db = getDb()
    const cutoff = localDayBounds(shiftLocalDay(toLocalDay(nowMillis()), -7)).start
    const recentPlatforms = db
      .prepare(
        `
      SELECT platform, COUNT(*) as cnt
      FROM problem_visits
      WHERE entered_at >= ?
      GROUP BY platform
      ORDER BY cnt DESC
      LIMIT 3
    `,
      )
      .all(cutoff) as { platform: string; cnt: number }[]

    for (const { platform } of recentPlatforms) {
      const site = getSiteById(platform)
      if (site?.enabled && site.homeUrl) {
        try {
          const origin = new URL(site.homeUrl).origin
          session.defaultSession.preconnect({ url: origin, numSockets: 1 })
        } catch {
          /* invalid url */
        }
      }
    }
  } catch {
    /* ignore */
  }
}
