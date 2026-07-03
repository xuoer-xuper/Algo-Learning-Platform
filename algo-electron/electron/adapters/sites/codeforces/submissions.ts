import type { ProblemIdentity, SubmissionData, Verdict } from '../../../shared/types'
import { nowBeijing, toBeijing } from '../../../shared/time'
import { pickFinalRealtimeSubmission } from '../../../submissions/realtimeSubmissionFilter'
import {
  scanGenericSubmissionTable,
  selectBestSubmissionTable,
  type GenericTableData,
} from '../../../submissions/scrapers/GenericTableScanner'
import type { SubmissionDetectionPayload, TableParseContext } from '../../types'
import { parseCodeforcesProblem } from './problem'
import { buildCodeforcesProblemUrl, type CodeforcesUrlKind } from './urls'

export interface CodeforcesSubmission {
  id: number
  contestId: number
  problem: {
    contestId: number
    index: string
    name: string
  }
  verdict?: string
  programmingLanguage?: string
  timeConsumedMillis?: number
  memoryConsumedBytes?: number
  creationTimeSeconds: number
}

interface CodeforcesRealtimeResponse {
  tables?: unknown
  apiSubmission?: unknown
}

function mapCodeforcesVerdict(verdict: string | undefined): Verdict {
  switch (verdict) {
    case 'OK': return 'AC'
    case 'WRONG_ANSWER': return 'WA'
    case 'TIME_LIMIT_EXCEEDED': return 'TLE'
    case 'MEMORY_LIMIT_EXCEEDED': return 'MLE'
    case 'RUNTIME_ERROR': return 'RE'
    case 'COMPILATION_ERROR': return 'CE'
    case 'PRESENTATION_ERROR': return 'PE'
    case 'SKIPPED': return 'SKIPPED'
    case 'TESTING': return 'TESTING'
    default: return 'UNKNOWN'
  }
}

export function parseCodeforcesApiSubmission(submission: CodeforcesSubmission): SubmissionData {
  return {
    platform: 'codeforces',
    platformSubmissionId: `cf-${submission.id}`,
    verdict: mapCodeforcesVerdict(submission.verdict),
    rawVerdict: submission.verdict,
    language: submission.programmingLanguage,
    submittedAt: toBeijing(new Date(submission.creationTimeSeconds * 1000)),
    runtimeMs: submission.timeConsumedMillis,
    memoryKb: typeof submission.memoryConsumedBytes === 'number'
      ? Math.round(submission.memoryConsumedBytes / 1024)
      : undefined,
    sourceUrl: `https://codeforces.com/contest/${submission.contestId}/submission/${submission.id}`,
    rawJson: JSON.stringify(submission),
  }
}

function isCodeforcesApiSubmission(value: unknown): value is CodeforcesSubmission {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<CodeforcesSubmission>
  return typeof record.id === 'number'
    && typeof record.contestId === 'number'
    && typeof record.creationTimeSeconds === 'number'
    && typeof record.problem === 'object'
    && record.problem !== null
}

export function parseCodeforcesSubmissionTables(
  tables: GenericTableData[],
  ctx: TableParseContext,
): SubmissionData[] {
  const table = selectBestSubmissionTable(tables)
  if (!table) return []

  return scanGenericSubmissionTable(table, {
    platform: 'codeforces',
    submissionPrefix: 'cf',
    now: ctx.now,
  })
}

export function parseCodeforcesRealtimeTablePayload(raw: SubmissionDetectionPayload): SubmissionData | null {
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as CodeforcesRealtimeResponse
    : null
  if (isCodeforcesApiSubmission(response?.apiSubmission)) {
    const apiSubmission = parseCodeforcesApiSubmission(response.apiSubmission)
    return pickFinalRealtimeSubmission([apiSubmission])
  }

  if (!Array.isArray(response?.tables)) return null
  const tables = response.tables as GenericTableData[]
  const table = selectBestSubmissionTable(tables)
  if (!table?.rows.length) return null

  const latestOnlyTable: GenericTableData = {
    ...table,
    rows: [table.rows[0]],
  }
  const latestSubmissions = parseCodeforcesSubmissionTables([latestOnlyTable], { now: nowBeijing })
  return pickFinalRealtimeSubmission(latestSubmissions)
}

function normalizeCell(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function getRawSubmissionRow(submission: SubmissionData): { headers: string[]; texts: string[]; links: string[] } | null {
  try {
    const raw = JSON.parse(submission.rawJson || '{}')
    const headers = Array.isArray(raw.headers) ? raw.headers.map(normalizeCell) : []
    const texts = Array.isArray(raw.row?.texts) ? raw.row.texts.map(normalizeCell) : []
    const links = Array.isArray(raw.row?.links) ? raw.row.links.map(normalizeCell) : []
    if (!texts.length && !links.length) return null
    return { headers, texts, links }
  } catch {
    return null
  }
}

function findProblemColumn(headers: string[], texts: string[], links: string[]): number {
  const headerIndex = headers.findIndex(header => /problem|问题|题目/i.test(header))
  if (headerIndex >= 0) return headerIndex

  const linkIndex = links.findIndex(link => parseCodeforcesProblem(link) !== null)
  if (linkIndex >= 0) return linkIndex

  return texts.findIndex(text => /^(\d+[A-Za-z]\d*|[A-Za-z]\d*)(?:\s*[-–—.．:]\s*|\s+)\S/.test(text))
}

function parseContestContext(url: string): { contestId: string; kind: CodeforcesUrlKind } | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'codeforces.com' && parsed.hostname !== 'www.codeforces.com') return null

    const contestMatch = parsed.pathname.match(/^\/contest\/(\d+)/)
    if (contestMatch) return { contestId: contestMatch[1], kind: 'contest' }

    const gymMatch = parsed.pathname.match(/^\/gym\/(\d+)/)
    if (gymMatch) return { contestId: gymMatch[1], kind: 'gym' }
  } catch { /* ignore */ }
  return null
}

function stripProblemTitlePrefix(problemText: string, identity: ProblemIdentity): string | undefined {
  const title = normalizeCell(problemText)
  if (!title) return undefined

  const tokens = [
    identity.platformProblemId,
    identity.contestId && identity.problemIndex ? `${identity.contestId}${identity.problemIndex}` : '',
    identity.problemIndex,
  ].filter((token): token is string => Boolean(token?.trim()))

  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = title.match(new RegExp(`^${escaped}(?:\\s*[-–—.．:]\\s*|\\s+)(\\S.*)$`, 'i'))
    if (match?.[1]) return match[1].trim()
  }

  return undefined
}

function parseProblemTextWithPageContext(problemText: string, pageUrl: string): ProblemIdentity | null {
  const context = parseContestContext(pageUrl)
  if (!context) return null

  const match = normalizeCell(problemText).match(/^([A-Za-z]\d*)(?:\s*[-–—.．:]\s*|\s+)(.+)$/)
  if (!match) return null

  const problemIndex = match[1]
  const title = match[2].trim()
  return {
    platform: 'codeforces',
    platformProblemId: `${context.contestId}${problemIndex}`,
    canonicalUrl: buildCodeforcesProblemUrl(context.contestId, problemIndex, context.kind),
    contestId: context.contestId,
    problemIndex,
    title: title || undefined,
    confidence: 'content',
  }
}

function parseProblemTextWithoutPageContext(problemText: string): ProblemIdentity | null {
  const match = normalizeCell(problemText).match(/^(\d+)([A-Za-z]\d*)(?:\s*[-–—.．:]\s*|\s+)(.+)$/)
  if (!match) return null

  const contestId = match[1]
  const problemIndex = match[2]
  const title = match[3].trim()
  return {
    platform: 'codeforces',
    platformProblemId: `${contestId}${problemIndex}`,
    canonicalUrl: buildCodeforcesProblemUrl(contestId, problemIndex, 'contest'),
    contestId,
    problemIndex,
    title: title || undefined,
    confidence: 'content',
  }
}

function resolveProblemIdentityFromSubmissionRow(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
  const row = getRawSubmissionRow(submission)
  if (!row) return null

  const problemColumn = findProblemColumn(row.headers, row.texts, row.links)
  const problemText = problemColumn >= 0 ? row.texts[problemColumn] : ''
  const problemLink = problemColumn >= 0 ? row.links[problemColumn] : row.links.find(link => parseCodeforcesProblem(link) !== null)

  const identityFromLink = problemLink ? parseCodeforcesProblem(problemLink) : null
  if (identityFromLink) {
    const title = stripProblemTitlePrefix(problemText, identityFromLink)
    return title ? { ...identityFromLink, title } : identityFromLink
  }

  return parseProblemTextWithPageContext(problemText, raw.pageUrl)
    ?? parseProblemTextWithoutPageContext(problemText)
}

function resolveProblemIdentityFromApiSubmission(submission: SubmissionData): ProblemIdentity | null {
  try {
    const raw = JSON.parse(submission.rawJson || '{}') as CodeforcesSubmission
    if (!raw?.problem?.contestId || !raw.problem.index) return null
    const contestId = String(raw.problem.contestId)
    return {
      platform: 'codeforces',
      platformProblemId: `${contestId}${raw.problem.index}`,
      canonicalUrl: buildCodeforcesProblemUrl(contestId, raw.problem.index, 'contest'),
      contestId,
      problemIndex: raw.problem.index,
      title: raw.problem.name,
      confidence: 'content',
    }
  } catch {
    return null
  }
}

export function resolveCodeforcesProblemIdentityFromSubmission(
  submission: SubmissionData,
  raw: SubmissionDetectionPayload,
): ProblemIdentity | null {
  return resolveProblemIdentityFromApiSubmission(submission)
    ?? resolveProblemIdentityFromSubmissionRow(submission, raw)
}
