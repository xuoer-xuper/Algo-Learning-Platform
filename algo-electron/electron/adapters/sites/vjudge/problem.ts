import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import type { SubmissionDetectionPayload } from '../../types'
import { findColumnIndex, stripHtml } from '../../shared/genericSubmission'

export interface VjudgeProblemText {
  problemId: string
  sourcePlatform: string
  sourceProblemId: string
}

export function parseVjudgeProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'vjudge.net' && parsed.hostname !== 'www.vjudge.net') return null

    const problemMatch = parsed.pathname.match(/^\/problem\/([^/\s]+)-(.+)/)
    if (problemMatch) {
      const sourceOJ = problemMatch[1]
      const problemId = problemMatch[2]
      return {
        platform: 'vjudge',
        platformProblemId: `${sourceOJ}-${problemId}`,
        canonicalUrl: `https://vjudge.net/problem/${sourceOJ}-${problemId}`,
        sourcePlatform: sourceOJ,
        sourceProblemId: problemId,
        confidence: 'url',
      }
    }

    const contestMatch = parsed.pathname.match(/^\/contest\/(\d+)/)
    const problemLetter = parsed.hash.match(/#problem\/([A-Za-z0-9]+)/)?.[1]
    if (contestMatch && problemLetter) {
      const contestId = contestMatch[1]
      return {
        platform: 'vjudge',
        platformProblemId: `contest-${contestId}-${problemLetter}`,
        canonicalUrl: `https://vjudge.net/contest/${contestId}#problem/${problemLetter}`,
        contestId,
        problemIndex: problemLetter,
        confidence: 'url',
      }
    }
  } catch {
    return null
  }
  return null
}

export function matchVjudgeProblem(url: string): boolean {
  if (parseVjudgeProblem(url) !== null) return true
  try {
    const parsed = new URL(url)
    return (parsed.hostname === 'vjudge.net' || parsed.hostname === 'www.vjudge.net')
      && /^\/contest\/\d+\/?$/.test(parsed.pathname)
      && (!parsed.hash || parsed.hash.startsWith('#problem'))
  } catch {
    return false
  }
}

export function matchVjudgeSubmissionResult(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (parsed.hostname === 'vjudge.net' || parsed.hostname === 'www.vjudge.net')
      && (
        /^\/solution\/\d+\/?$/.test(parsed.pathname)
        || /^\/problem\/view\/submission\/\d+\/?$/.test(parsed.pathname)
        || /^\/status\/?$/.test(parsed.pathname)
        || (/^\/contest\/\d+\/?$/.test(parsed.pathname) && parsed.hash.startsWith('#status'))
      )
  } catch {
    return false
  }
}

export function parseVjudgeProblemText(value: unknown): VjudgeProblemText | null {
  const text = stripHtml(value).replace(/\s+/g, ' ').trim()
  if (!text) return null

  const match = text.match(/^([A-Za-z][A-Za-z0-9_+.-]*)[-\s]+(.+)$/)
  if (!match) return null

  const sourcePlatform = match[1].trim()
  const sourceProblemId = match[2].replace(/\s+/g, '').trim()
  if (!sourcePlatform || !sourceProblemId) return null

  return {
    problemId: `${sourcePlatform}-${sourceProblemId}`,
    sourcePlatform,
    sourceProblemId,
  }
}

export function attachVjudgeRawProblemContext(submission: SubmissionData): SubmissionData {
  try {
    const raw = JSON.parse(submission.rawJson || '{}')
    const headers = Array.isArray(raw.headers) ? raw.headers : []
    const texts = Array.isArray(raw.row?.texts) ? raw.row.texts : []
    const problemIdx = findColumnIndex(headers, ['Problem', '题目', '问题'])
    const problem = parseVjudgeProblemText(problemIdx >= 0 ? texts[problemIdx] : raw._vjudgeProblem)
    if (!problem) return submission

    return {
      ...submission,
      rawJson: JSON.stringify({
        ...raw,
        _vjudgeProblem: problemIdx >= 0 ? texts[problemIdx] : raw._vjudgeProblem,
        _vjudgeProblemId: problem.problemId,
        _vjudgeSourcePlatform: problem.sourcePlatform,
        _vjudgeSourceProblemId: problem.sourceProblemId,
      }),
      _vjudgeProblemId: problem.problemId,
    } as SubmissionData & { _vjudgeProblemId?: string }
  } catch {
    return submission
  }
}

export function getVjudgePageProblem(url: string): { problemId?: string; contestId?: string; problemIndex?: string } | null {
  const identity = parseVjudgeProblem(url)
  if (!identity) return null
  return {
    problemId: identity.sourcePlatform && identity.sourceProblemId
      ? `${identity.sourcePlatform}-${identity.sourceProblemId}`
      : undefined,
    contestId: identity.contestId,
    problemIndex: identity.problemIndex,
  }
}

export function statusCellsMatchPageProblem(
  raw: SubmissionDetectionPayload,
  cells: string[],
  parsedProblem: VjudgeProblemText | null,
): boolean {
  const pageProblem = getVjudgePageProblem(raw.pageUrl)
  if (!pageProblem) return false

  if (pageProblem.problemId) {
    return parsedProblem?.problemId.toLowerCase() === pageProblem.problemId.toLowerCase()
  }

  const problemIndex = pageProblem.problemIndex?.trim()
  if (!problemIndex) return false
  const joined = cells.join(' ')
  const escaped = problemIndex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`, 'i').test(joined)
    || Boolean(parsedProblem?.sourceProblemId?.toLowerCase().endsWith(problemIndex.toLowerCase()))
}
