import { session } from 'electron'
import { getDb } from '../db/connection'
import { getSiteById } from '../db/repositories/siteRepository'

export function preconnectRecentSiteOrigins(): void {
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
}
