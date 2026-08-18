import { getDb } from '../../connection'
import type { OmniboxSuggestion } from './types'

export const OMNIBOX_SUGGESTION_LIMIT = 8

const PROBLEM_CANDIDATE_LIMIT = 24
const RECENT_VISIT_CANDIDATE_LIMIT = 64
const MAX_OMNIBOX_QUERY_LENGTH = 256

interface OmniboxCandidateRow {
  problem_id: string
  title: string | null
  platform: string
  platform_problem_id: string
  canonical_url: string
  suggestion_url: string
  suggestion_last_visited_at: string | null
  source: 'history' | 'problem'
}

interface OmniboxCandidate extends OmniboxSuggestion {
  canonicalUrl: string
}

const FIELD_MATCH_SQL = `
  COALESCE(p.title, '') COLLATE NOCASE LIKE @contains ESCAPE '\\'
  OR p.platform_problem_id COLLATE NOCASE LIKE @contains ESCAPE '\\'
  OR p.platform COLLATE NOCASE LIKE @contains ESCAPE '\\'
  OR p.canonical_url COLLATE NOCASE LIKE @contains ESCAPE '\\'
`

const FIELD_RANK_SQL = `
  CASE
    WHEN COALESCE(p.title, '') = @exact COLLATE NOCASE
      OR p.platform_problem_id = @exact COLLATE NOCASE
      OR p.platform = @exact COLLATE NOCASE
      OR p.canonical_url = @exact COLLATE NOCASE
      THEN 0
    WHEN COALESCE(p.title, '') COLLATE NOCASE LIKE @prefix ESCAPE '\\'
      OR p.platform_problem_id COLLATE NOCASE LIKE @prefix ESCAPE '\\'
      OR p.platform COLLATE NOCASE LIKE @prefix ESCAPE '\\'
      OR p.canonical_url COLLATE NOCASE LIKE @prefix ESCAPE '\\'
      THEN 1
    ELSE 2
  END
`

export function getOmniboxSuggestions(rawQuery: string): OmniboxSuggestion[] {
  const query = rawQuery.trim().slice(0, MAX_OMNIBOX_QUERY_LENGTH)
  const params = createMatchParams(query)
  const candidates = [
    ...listProblemCandidates(query, params),
    ...listRecentVisitCandidates(query, params),
  ].map(toCandidate)

  candidates.sort((left, right) => compareCandidates(left, right, query))

  const seenProblemIds = new Set<string>()
  const seenUrls = new Set<string>()
  const suggestions: OmniboxSuggestion[] = []

  for (const candidate of candidates) {
    const urlKey = normalizeUrlKey(candidate.url)
    if (seenProblemIds.has(candidate.problemId) || seenUrls.has(urlKey)) continue
    seenProblemIds.add(candidate.problemId)
    seenUrls.add(urlKey)
    suggestions.push({
      problemId: candidate.problemId,
      title: candidate.title,
      platform: candidate.platform,
      platformProblemId: candidate.platformProblemId,
      url: candidate.url,
      lastVisitedAt: candidate.lastVisitedAt,
      source: candidate.source,
    })
    if (suggestions.length === OMNIBOX_SUGGESTION_LIMIT) break
  }

  return suggestions
}

function listProblemCandidates(
  query: string,
  params: ReturnType<typeof createMatchParams>,
): OmniboxCandidateRow[] {
  const db = getDb()
  const where = query
    ? `p.deleted_at IS NULL AND (${FIELD_MATCH_SQL})`
    : 'p.deleted_at IS NULL AND p.last_visited_at IS NOT NULL'
  const rank = query ? FIELD_RANK_SQL : '2'
  const orderBy = query
    ? 'match_rank ASC, p.last_visited_at DESC, p.id ASC'
    : 'p.last_visited_at DESC, p.id ASC'

  return db.prepare(`
    WITH candidates AS (
      SELECT
        p.id AS problem_id,
        p.title,
        p.platform,
        p.platform_problem_id,
        p.canonical_url,
        p.last_visited_at,
        ${rank} AS match_rank
      FROM problems p
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT @problemCandidateLimit
    )
    SELECT
      candidates.problem_id,
      candidates.title,
      candidates.platform,
      candidates.platform_problem_id,
      candidates.canonical_url,
      COALESCE(latest_visit.url, candidates.canonical_url) AS suggestion_url,
      COALESCE(latest_visit.entered_at, candidates.last_visited_at) AS suggestion_last_visited_at,
      CASE WHEN latest_visit.id IS NULL THEN 'problem' ELSE 'history' END AS source
    FROM candidates
    LEFT JOIN problem_visits latest_visit
      ON latest_visit.id = (
        SELECT recent.id
        FROM problem_visits recent
        WHERE recent.problem_id = candidates.problem_id
          AND recent.deleted_at IS NULL
        ORDER BY recent.entered_at DESC, recent.id ASC
        LIMIT 1
      )
  `).all({ ...params, problemCandidateLimit: PROBLEM_CANDIDATE_LIMIT }) as OmniboxCandidateRow[]
}

function listRecentVisitCandidates(
  query: string,
  params: ReturnType<typeof createMatchParams>,
): OmniboxCandidateRow[] {
  const db = getDb()
  const visitMatch = query
    ? `AND (${FIELD_MATCH_SQL} OR recent_visits.url COLLATE NOCASE LIKE @contains ESCAPE '\\')`
    : ''

  return db.prepare(`
    WITH recent_visits AS (
      SELECT pv.id, pv.problem_id, pv.url, pv.entered_at
      FROM problem_visits pv
      WHERE pv.deleted_at IS NULL
      ORDER BY pv.entered_at DESC
      LIMIT @recentVisitCandidateLimit
    )
    SELECT
      p.id AS problem_id,
      p.title,
      p.platform,
      p.platform_problem_id,
      p.canonical_url,
      recent_visits.url AS suggestion_url,
      recent_visits.entered_at AS suggestion_last_visited_at,
      'history' AS source
    FROM recent_visits
    JOIN problems p ON p.id = recent_visits.problem_id
    WHERE p.deleted_at IS NULL
      ${visitMatch}
  `).all({ ...params, recentVisitCandidateLimit: RECENT_VISIT_CANDIDATE_LIMIT }) as OmniboxCandidateRow[]
}

function createMatchParams(query: string): { exact: string; prefix: string; contains: string } {
  const escaped = escapeLikePattern(query)
  return {
    exact: query,
    prefix: `${escaped}%`,
    contains: `%${escaped}%`,
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function toCandidate(row: OmniboxCandidateRow): OmniboxCandidate {
  return {
    problemId: row.problem_id,
    title: row.title,
    platform: row.platform,
    platformProblemId: row.platform_problem_id,
    canonicalUrl: row.canonical_url,
    url: row.suggestion_url,
    lastVisitedAt: row.suggestion_last_visited_at,
    source: row.source,
  }
}

function compareCandidates(left: OmniboxCandidate, right: OmniboxCandidate, query: string): number {
  const rankDifference = getMatchRank(left, query) - getMatchRank(right, query)
  if (rankDifference !== 0) return rankDifference

  const recencyDifference = parseTimestamp(right.lastVisitedAt) - parseTimestamp(left.lastVisitedAt)
  if (recencyDifference !== 0) return recencyDifference

  if (left.source !== right.source) return left.source === 'history' ? -1 : 1
  const problemDifference = compareText(left.problemId, right.problemId)
  return problemDifference !== 0 ? problemDifference : compareText(left.url, right.url)
}

function getMatchRank(candidate: OmniboxCandidate, query: string): number {
  if (!query) return 2
  const normalizedQuery = query.toLowerCase()
  const fields = [
    candidate.title ?? '',
    candidate.platformProblemId,
    candidate.platform,
    candidate.canonicalUrl,
    candidate.url,
  ].map(value => value.toLowerCase())

  if (fields.some(value => value === normalizedQuery)) return 0
  if (fields.some(value => value.startsWith(normalizedQuery))) return 1
  return 2
}

function parseTimestamp(value: string | null): number {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function normalizeUrlKey(value: string): string {
  try {
    return new URL(value).toString()
  } catch {
    return value.trim()
  }
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}
