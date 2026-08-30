import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BrowserPageEvent } from '../../electron/browser/TabManager.ts'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection.ts'
import { getEnabledSites, seedBuiltinSites } from '../../electron/db/repositories/siteRepository.ts'
import { setEnabledSitesFetcher } from '../../electron/parsers/registry.ts'
import type { Logger } from '../../electron/shared/logger.ts'
import { TrackingService } from '../../electron/tracking/TrackingService.ts'
import { startProblemVisit } from '../../electron/db/repositories/problemVisitRepository.ts'

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  getLogFilePath: () => null,
}

let temporaryDirectory = ''

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-tracking-db-'))
  initDbAtPath(path.join(temporaryDirectory, 'tracking.sqlite'))
  seedBuiltinSites()
  // Mirrors initializeMainServices: URL parsing needs the enabled-site source.
  // Without it this file only passed when another suite had installed one.
  setEnabledSitesFetcher(getEnabledSites)
})

afterEach(() => {
  closeDb()
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

function page(
  windowId: string,
  tabId: string,
  webContentsId: number,
  url: string,
): BrowserPageEvent {
  return {
    windowId,
    tabId,
    webContentsId,
    url,
    isMainFrame: true,
    reason: 'did-navigate',
  }
}

interface VisitRow {
  id: string
  url: string
  left_at: string | null
  duration_seconds: number | null
}

function visits(): VisitRow[] {
  return getDb().prepare(`
    SELECT id, url, left_at, duration_seconds
    FROM problem_visits
    ORDER BY url
  `).all() as VisitRow[]
}

describe('TrackingService database lifecycle', () => {
  it('keeps visits independent across windows and closes only the requested window', () => {
    let clock = 0
    let now = '2026-08-19T09:00:00+08:00'
    const service = new TrackingService({ logger, clock: () => clock, now: () => now })
    const first = page('window-1', 'tab-1', 101, 'https://codeforces.com/contest/1900/problem/A')
    const second = page('window-2', 'tab-2', 202, 'https://codeforces.com/contest/1900/problem/B')

    service.handleNavigation(first)
    service.handleNavigation(second)
    expect(visits()).toHaveLength(2)
    expect(visits().every(visit => visit.left_at === null)).toBe(true)

    clock = 5_000
    now = '2026-08-19T09:00:05+08:00'
    service.endVisitForPage(first)

    const afterFirstClose = visits()
    expect(afterFirstClose.find(visit => visit.url.endsWith('/A'))).toMatchObject({
      left_at: now,
      duration_seconds: 5,
    })
    expect(afterFirstClose.find(visit => visit.url.endsWith('/B'))?.left_at).toBeNull()

    clock = 12_000
    now = '2026-08-19T09:00:12+08:00'
    service.endCurrentVisit()
    expect(visits().find(visit => visit.url.endsWith('/B'))).toMatchObject({
      left_at: now,
      duration_seconds: 12,
    })
  })

  it('deduplicates the same problem and ignores destruction of a background source', () => {
    let clock = 0
    let now = '2026-08-19T10:00:00+08:00'
    const service = new TrackingService({ logger, clock: () => clock, now: () => now })
    const formerSource = page('window-1', 'tab-a', 301, 'https://codeforces.com/contest/2000/problem/C')
    const activeSource = page('window-1', 'tab-b', 302, formerSource.url)

    service.handleNavigation(formerSource)
    service.handleNavigation(activeSource)

    expect(visits()).toHaveLength(1)
    const activityCount = getDb().prepare(
      "SELECT COUNT(*) AS count FROM activity_events WHERE event_type = 'visit_start'",
    ).get() as { count: number }
    expect(activityCount.count).toBe(1)

    clock = 4_000
    now = '2026-08-19T10:00:04+08:00'
    service.endVisitForPage(formerSource)
    expect(visits()[0].left_at).toBeNull()

    clock = 7_000
    now = '2026-08-19T10:00:07+08:00'
    service.endVisitForPage(activeSource)
    expect(visits()[0]).toMatchObject({ left_at: now, duration_seconds: 7 })
  })
})

describe('problemVisitRepository transactions', () => {
  it('rolls back the problem and visit when the activity insert fails', () => {
    const db = getDb()
    db.exec(`
      CREATE TRIGGER reject_visit_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.event_type = 'visit_start'
      BEGIN
        SELECT RAISE(ABORT, 'activity insert rejected');
      END;
    `)

    expect(() => startProblemVisit({
      identity: {
        platform: 'codeforces',
        platformProblemId: '2100A',
        canonicalUrl: 'https://codeforces.com/contest/2100/problem/A',
        contestId: '2100',
        problemIndex: 'A',
        confidence: 'url',
      },
      visitId: 'visit-atomicity',
      activityId: 'activity-atomicity',
      now: '2026-08-19T11:00:00+08:00',
      localDay: '2026-08-19',
    })).toThrow(/activity insert rejected/)

    for (const table of ['problems', 'problem_visits', 'activity_events']) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
      expect(row.count).toBe(0)
    }
  })
})
