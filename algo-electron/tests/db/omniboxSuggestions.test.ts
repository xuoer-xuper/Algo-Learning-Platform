import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  getOmniboxSuggestions,
  OMNIBOX_SUGGESTION_LIMIT,
} from '../../electron/db/repositories/problemRepository'

let temporaryDirectory = ''

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-omnibox-suggestions-'))
  initDbAtPath(path.join(temporaryDirectory, 'test.sqlite'))
})

afterEach(() => {
  closeDb()
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

interface ProblemFixture {
  id: string
  platform?: string
  platformProblemId?: string
  canonicalUrl?: string
  title?: string | null
  lastVisitedAt?: string | null
  deletedAt?: string | null
}

interface VisitFixture {
  id: string
  problemId: string
  url: string
  enteredAt: string
  deletedAt?: string | null
}

function insertProblem(fixture: ProblemFixture): void {
  const platform = fixture.platform ?? 'codeforces'
  const platformProblemId = fixture.platformProblemId ?? fixture.id
  const canonicalUrl = fixture.canonicalUrl ?? `https://example.com/problems/${fixture.id}`
  const timestamp = fixture.lastVisitedAt ?? '2026-07-03T10:00:00+08:00'
  getDb().prepare(`
    INSERT INTO problems (
      id, platform, platform_problem_id, canonical_url, title, status,
      first_seen_at, last_visited_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, 'visited', ?, ?, ?, ?, ?)
  `).run(
    fixture.id,
    platform,
    platformProblemId,
    canonicalUrl,
    fixture.title ?? fixture.id,
    timestamp,
    timestamp,
    timestamp,
    timestamp,
    fixture.deletedAt ?? null,
  )
}

function insertVisit(fixture: VisitFixture): void {
  getDb().prepare(`
    INSERT INTO problem_visits (
      id, problem_id, platform, url, entered_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, 'codeforces', ?, ?, ?, ?, ?)
  `).run(
    fixture.id,
    fixture.problemId,
    fixture.url,
    fixture.enteredAt,
    fixture.enteredAt,
    fixture.enteredAt,
    fixture.deletedAt ?? null,
  )
}

function timestamp(hour: number, minute = 0): string {
  return `2026-07-03T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`
}

describe('getOmniboxSuggestions', () => {
  it('returns at most eight stable recent suggestions and prefers the latest visit URL', () => {
    for (let index = 0; index < 10; index += 1) {
      const id = `problem-${index}`
      const visitedAt = timestamp(index + 1)
      insertProblem({ id, lastVisitedAt: visitedAt })
      insertVisit({
        id: `visit-${index}`,
        problemId: id,
        url: `https://example.com/visited/${id}`,
        enteredAt: visitedAt,
      })
    }
    insertVisit({
      id: 'visit-9-older',
      problemId: 'problem-9',
      url: 'https://example.com/visited/problem-9-old',
      enteredAt: timestamp(1, 30),
    })

    const suggestions = getOmniboxSuggestions('')

    expect(suggestions).toHaveLength(OMNIBOX_SUGGESTION_LIMIT)
    expect(suggestions.map(suggestion => suggestion.problemId)).toEqual([
      'problem-9',
      'problem-8',
      'problem-7',
      'problem-6',
      'problem-5',
      'problem-4',
      'problem-3',
      'problem-2',
    ])
    expect(suggestions[0]).toMatchObject({
      url: 'https://example.com/visited/problem-9',
      source: 'history',
      lastVisitedAt: timestamp(10),
    })
  })

  it('matches metadata and recent URLs while ranking exact, prefix, then recency', () => {
    insertProblem({
      id: 'exact',
      platformProblemId: 'ABC',
      title: 'Older exact identifier',
      lastVisitedAt: timestamp(2),
    })
    insertProblem({
      id: 'prefix',
      platformProblemId: 'P-2',
      title: 'ABC Graph Walk',
      lastVisitedAt: timestamp(8),
    })
    insertProblem({
      id: 'substring',
      platformProblemId: 'P-3',
      title: 'Solve the ABC challenge',
      lastVisitedAt: timestamp(9),
    })
    insertProblem({
      id: 'platform',
      platform: 'luogu',
      platformProblemId: 'P1000',
      title: 'Platform match',
      lastVisitedAt: timestamp(7),
    })
    insertProblem({
      id: 'url',
      platformProblemId: 'URL-1',
      canonicalUrl: 'https://example.com/canonical/url-entry',
      title: 'Recent URL match',
      lastVisitedAt: timestamp(6),
    })
    insertVisit({
      id: 'url-visit',
      problemId: 'url',
      url: 'https://example.com/history/special-route',
      enteredAt: timestamp(6),
    })

    expect(getOmniboxSuggestions('abc').map(suggestion => suggestion.problemId)).toEqual([
      'exact',
      'prefix',
      'substring',
    ])
    expect(getOmniboxSuggestions('LUOGU').map(suggestion => suggestion.problemId)).toEqual(['platform'])
    expect(getOmniboxSuggestions('canonical/url-entry').map(suggestion => suggestion.problemId)).toEqual(['url'])
    expect(getOmniboxSuggestions('special-route')).toEqual([
      expect.objectContaining({
        problemId: 'url',
        url: 'https://example.com/history/special-route',
        source: 'history',
      }),
    ])
  })

  it('treats percent, underscore, and escape characters as LIKE literals', () => {
    insertProblem({ id: 'percent', title: 'Rate 100% Complete', platformProblemId: 'RATE-1' })
    insertProblem({ id: 'percent-decoy', title: 'Rate 1000 Complete', platformProblemId: 'RATE-2' })
    insertProblem({ id: 'underscore', title: 'Literal underscore', platformProblemId: 'A_B' })
    insertProblem({ id: 'underscore-decoy', title: 'Wildcard decoy', platformProblemId: 'AXB' })
    insertProblem({ id: 'escape', title: 'Path \\ Root', platformProblemId: 'PATH-1' })

    expect(getOmniboxSuggestions('100%').map(suggestion => suggestion.problemId)).toEqual(['percent'])
    expect(getOmniboxSuggestions('A_B').map(suggestion => suggestion.problemId)).toEqual(['underscore'])
    expect(getOmniboxSuggestions('\\').map(suggestion => suggestion.problemId)).toEqual(['escape'])
  })

  it('filters deleted rows and ignores deleted visits when choosing a URL', () => {
    insertProblem({
      id: 'active',
      title: 'Visible problem',
      canonicalUrl: 'https://example.com/canonical/visible',
      lastVisitedAt: timestamp(8),
    })
    insertVisit({
      id: 'active-visit',
      problemId: 'active',
      url: 'https://example.com/history/visible-route',
      enteredAt: timestamp(7),
    })
    insertVisit({
      id: 'deleted-visit',
      problemId: 'active',
      url: 'https://example.com/history/hidden-route',
      enteredAt: timestamp(8),
      deletedAt: timestamp(9),
    })
    insertProblem({
      id: 'deleted-problem',
      title: 'Hidden problem',
      lastVisitedAt: timestamp(9),
      deletedAt: timestamp(10),
    })
    insertVisit({
      id: 'deleted-problem-visit',
      problemId: 'deleted-problem',
      url: 'https://example.com/history/deleted-problem',
      enteredAt: timestamp(9),
    })

    expect(getOmniboxSuggestions('hidden-route')).toEqual([])
    expect(getOmniboxSuggestions('Hidden problem')).toEqual([])
    expect(getOmniboxSuggestions('Visible problem')).toEqual([
      expect.objectContaining({
        problemId: 'active',
        url: 'https://example.com/history/visible-route',
      }),
    ])
  })

  it('deduplicates repeated visits, problem candidates, and shared URLs', () => {
    const sharedUrl = 'https://example.com/problems/shared'
    insertProblem({ id: 'older', canonicalUrl: sharedUrl, title: 'Shared target', lastVisitedAt: timestamp(4) })
    insertProblem({ id: 'newer', canonicalUrl: sharedUrl, title: 'Shared target', lastVisitedAt: timestamp(8) })
    insertVisit({ id: 'newer-1', problemId: 'newer', url: sharedUrl, enteredAt: timestamp(7) })
    insertVisit({ id: 'newer-2', problemId: 'newer', url: sharedUrl, enteredAt: timestamp(8) })
    insertVisit({ id: 'older-1', problemId: 'older', url: sharedUrl, enteredAt: timestamp(4) })

    const suggestions = getOmniboxSuggestions('Shared target')

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      problemId: 'newer',
      url: sharedUrl,
      source: 'history',
      lastVisitedAt: timestamp(8),
    })
    expect(new Set(suggestions.map(suggestion => suggestion.problemId)).size).toBe(suggestions.length)
    expect(new Set(suggestions.map(suggestion => suggestion.url)).size).toBe(suggestions.length)
  })
})
