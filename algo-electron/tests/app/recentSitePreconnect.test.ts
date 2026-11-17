import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const dependencies = vi.hoisted(() => ({
  getDb: vi.fn(),
  getSiteById: vi.fn(),
  preconnect: vi.fn(),
}))
vi.mock('../../electron/db/connection', () => ({ getDb: dependencies.getDb }))
vi.mock('../../electron/db/repositories/siteRepository', () => ({
  getSiteById: dependencies.getSiteById,
}))
vi.mock('electron', () => ({
  session: { defaultSession: { preconnect: dependencies.preconnect } },
}))

import { preconnectRecentSiteOrigins } from '../../electron/app/recentSitePreconnect'

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('recent site preconnection', () => {
  it('should compare visits to numeric local-midnight bounds and include the boundary', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 5, 12).getTime() })
    const db = new Database(':memory:')
    const cutoff = new Date(2026, 9, 29).getTime()
    try {
      db.exec('CREATE TABLE problem_visits (platform TEXT NOT NULL, entered_at INTEGER NOT NULL)')
      const insert = db.prepare('INSERT INTO problem_visits VALUES (?, ?)')
      insert.run('included', cutoff)
      insert.run('excluded', cutoff - 1)
      let queryValue: unknown
      dependencies.getDb.mockReturnValue({
        prepare(sql: string) {
          return {
            all(value: unknown) {
              queryValue = value
              return db.prepare(sql).all(value)
            },
          }
        },
      })
      dependencies.getSiteById.mockImplementation((id: string) => ({
        enabled: true,
        homeUrl: `https://${id}.example.test/path`,
      }))
      preconnectRecentSiteOrigins()
      expect(queryValue).toBe(cutoff)
      expect(dependencies.preconnect).toHaveBeenCalledExactlyOnceWith({
        url: 'https://included.example.test',
        numSockets: 1,
      })
      expect(dependencies.getSiteById).toHaveBeenCalledExactlyOnceWith('included')
    } finally {
      db.close()
    }
  })
})
