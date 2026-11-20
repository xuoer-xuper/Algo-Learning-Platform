import { and, asc, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { getDb } from '../../connection'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { problems, problemVisits } from '../../../../src/main/db/schema'
import type { OmniboxSuggestion } from '../../../../src/shared/types/problem'

export const OMNIBOX_SUGGESTION_LIMIT = 8

const PROBLEM_CANDIDATE_LIMIT = 24
const RECENT_VISIT_CANDIDATE_LIMIT = 64
const MAX_OMNIBOX_QUERY_LENGTH = 256

interface OmniboxCandidateRow {
  problem_id: string | null
  title: string | null
  platform: string
  platform_problem_id: string
  canonical_url: string
  suggestion_url: string
  suggestion_last_visited_at: number | null
  source: 'history' | 'problem'
}

interface OmniboxCandidate extends OmniboxSuggestion {
  canonicalUrl: string
}

export function getOmniboxSuggestions(rawQuery: string): OmniboxSuggestion[] {
  const query = rawQuery.trim().slice(0, MAX_OMNIBOX_QUERY_LENGTH)
  const params = createMatchParams(query)
  const candidates = [
    ...listProblemCandidates(query, params),
    ...listRecentVisitCandidates(query, params),
  ].map(toCandidate)

  candidates.sort((left, right) => compareCandidates(left, right, query))

  const seenProblemIds = new Set<string | null>()
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
  const db = createDrizzleClient(getDb())
  const fieldMatch = sql`(
    COALESCE(${problems.title}, '') COLLATE NOCASE LIKE ${params.contains} ESCAPE '\\'
    OR ${problems.platform_problem_id} COLLATE NOCASE LIKE ${params.contains} ESCAPE '\\'
    OR ${problems.platform} COLLATE NOCASE LIKE ${params.contains} ESCAPE '\\'
    OR ${problems.canonical_url} COLLATE NOCASE LIKE ${params.contains} ESCAPE '\\'
  )`
  const rank = (
    query
      ? sql<number>`CASE
        WHEN COALESCE(${problems.title}, '') = ${params.exact} COLLATE NOCASE
          OR ${problems.platform_problem_id} = ${params.exact} COLLATE NOCASE
          OR ${problems.platform} = ${params.exact} COLLATE NOCASE
          OR ${problems.canonical_url} = ${params.exact} COLLATE NOCASE
          THEN 0
        WHEN COALESCE(${problems.title}, '') COLLATE NOCASE LIKE ${params.prefix} ESCAPE '\\'
          OR ${problems.platform_problem_id} COLLATE NOCASE LIKE ${params.prefix} ESCAPE '\\'
          OR ${problems.platform} COLLATE NOCASE LIKE ${params.prefix} ESCAPE '\\'
          OR ${problems.canonical_url} COLLATE NOCASE LIKE ${params.prefix} ESCAPE '\\'
          THEN 1
        ELSE 2
      END`
      : sql<number>`2`
  ).as('match_rank')
  const candidates = db.$with('candidates').as(
    db
      .select({
        problem_id: problems.id,
        title: problems.title,
        platform: problems.platform,
        platform_problem_id: problems.platform_problem_id,
        canonical_url: problems.canonical_url,
        last_visited_at: sql<number | null>`${problems.last_visited_at}`.as('last_visited_at'),
        match_rank: rank,
      })
      .from(problems)
      .where(
        and(isNull(problems.deleted_at), query ? fieldMatch : isNotNull(problems.last_visited_at)),
      )
      .orderBy(...(query ? [asc(rank)] : []), desc(problems.last_visited_at), asc(problems.id))
      .limit(PROBLEM_CANDIDATE_LIMIT),
  )
  const latestVisit = alias(problemVisits, 'latest_visit')
  const recent = alias(problemVisits, 'recent')
  const latestVisitId = db
    .select({ id: recent.id })
    .from(recent)
    .where(and(eq(recent.problem_id, candidates.problem_id), isNull(recent.deleted_at)))
    .orderBy(desc(recent.entered_at), asc(recent.id))
    .limit(1)

  return db
    .with(candidates)
    .select({
      problem_id: candidates.problem_id,
      title: candidates.title,
      platform: candidates.platform,
      platform_problem_id: candidates.platform_problem_id,
      canonical_url: candidates.canonical_url,
      suggestion_url: sql<string>`COALESCE(${latestVisit.url}, ${candidates.canonical_url})`,
      suggestion_last_visited_at: sql<
        number | null
      >`COALESCE(${latestVisit.entered_at}, ${candidates.last_visited_at})`,
      source: sql<
        'problem' | 'history'
      >`CASE WHEN ${latestVisit.id} IS NULL THEN 'problem' ELSE 'history' END`,
    })
    .from(candidates)
    .leftJoin(latestVisit, eq(latestVisit.id, latestVisitId))
    .all()
}

function listRecentVisitCandidates(
  query: string,
  params: ReturnType<typeof createMatchParams>,
): OmniboxCandidateRow[] {
  const db = createDrizzleClient(getDb())
  const recentVisits = db.$with('recent_visits').as(
    db
      .select({
        id: problemVisits.id,
        problem_id: problemVisits.problem_id,
        url: problemVisits.url,
        entered_at: sql<number>`${problemVisits.entered_at}`.as('entered_at'),
      })
      .from(problemVisits)
      .where(isNull(problemVisits.deleted_at))
      .orderBy(desc(problemVisits.entered_at))
      .limit(RECENT_VISIT_CANDIDATE_LIMIT),
  )
  const visitMatch = query
    ? or(
        sql`coalesce(${problems.title}, '') collate nocase like ${params.contains} escape ${'\\'}`,
        sql`${problems.platform_problem_id} collate nocase like ${params.contains} escape ${'\\'}`,
        sql`${problems.platform} collate nocase like ${params.contains} escape ${'\\'}`,
        sql`${problems.canonical_url} collate nocase like ${params.contains} escape ${'\\'}`,
        sql`${recentVisits.url} collate nocase like ${params.contains} escape ${'\\'}`,
      )
    : undefined

  return db
    .with(recentVisits)
    .select({
      // The unchanged equality INNER JOIN proves this non-null FK equals the parent ID.
      problem_id: recentVisits.problem_id,
      title: problems.title,
      platform: problems.platform,
      platform_problem_id: problems.platform_problem_id,
      canonical_url: problems.canonical_url,
      suggestion_url: recentVisits.url,
      suggestion_last_visited_at: recentVisits.entered_at,
      source: sql<'history'>`'history'`,
    })
    .from(recentVisits)
    .innerJoin(problems, eq(problems.id, recentVisits.problem_id))
    .where(and(isNull(problems.deleted_at), visitMatch))
    .all()
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

  const recencyDifference = (right.lastVisitedAt ?? 0) - (left.lastVisitedAt ?? 0)
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
  ].map((value) => value.toLowerCase())

  if (fields.some((value) => value === normalizedQuery)) return 0
  if (fields.some((value) => value.startsWith(normalizedQuery))) return 1
  return 2
}

function normalizeUrlKey(value: string): string {
  try {
    return new URL(value).toString()
  } catch {
    return value.trim()
  }
}

function compareText(left: string | null, right: string | null): number {
  if (left === right) return 0
  // Legacy comparison coerces a null ID to zero, not to a first/last sort key.
  if (left === null) return 0 < Number(right) ? -1 : 1
  if (right === null) return Number(left) < 0 ? -1 : 1
  return left < right ? -1 : 1
}
