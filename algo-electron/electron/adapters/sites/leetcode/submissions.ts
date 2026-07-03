import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import { nowBeijing } from '../../../shared/time'
import type { SubmissionDetectionPayload } from '../../types'
import { normalizeVerdict } from '../../verdictMap'
import { cleanBrowserProblemTitle } from '../../../parsers/browserTitle'
import { extractLeetcodeTitleSlugFromUrl } from './problem'

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function getString(record: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!record) return undefined
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function getValue(record: Record<string, unknown> | null, keys: string[]): unknown {
  if (!record) return undefined
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function getNestedRecord(record: Record<string, unknown> | null, path: string[]): Record<string, unknown> | null {
  let current: unknown = record
  for (const key of path) {
    const currentRecord = getRecord(current)
    if (!currentRecord) return null
    current = currentRecord[key]
  }
  return getRecord(current)
}

function getNestedString(record: Record<string, unknown> | null, paths: string[][]): string | undefined {
  for (const path of paths) {
    const parent = getNestedRecord(record, path.slice(0, -1))
    const value = getString(parent, [path[path.length - 1]])
    if (value) return value
  }
  return undefined
}

const LEETCODE_PENDING_PATTERN = /Pending|Started|Running|Judging|Evaluating|Compiling|正在判题|判题中|等待评测|排队|提交中|执行中|运行中|等待/i

// LeetCode can expose stale final-looking fields while nested judge/state fields
// still say pending, so all status-like fields are checked recursively.
function isPendingStatusField(key: string, value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const text = String(value).trim()
  if (!text) return false
  if (/^state(?:_?code)?$/i.test(key)) return text.toUpperCase() !== 'SUCCESS'
  if (!/(state|status|verdict|judge|result)/i.test(key)) return false
  return LEETCODE_PENDING_PATTERN.test(text)
}

function hasPendingStatusSignal(value: unknown, key = '', depth = 0): boolean {
  if (!value || depth > 8) return false
  if (isPendingStatusField(key, value)) return true
  if (Array.isArray(value)) return value.some(item => hasPendingStatusSignal(item, key, depth + 1))
  if (typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>)
    .some(([childKey, childValue]) => hasPendingStatusSignal(childValue, childKey, depth + 1))
}

function normalizeResponse(response: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!response) return null
  return getNestedRecord(response, ['data', 'submissionDetails'])
    ?? getNestedRecord(response, ['data', 'submissionDetail'])
    ?? getNestedRecord(response, ['data', 'submission'])
    ?? getNestedRecord(response, ['submissionDetails'])
    ?? response
}

function mapStatusCode(code: string | undefined): string | undefined {
  switch (code) {
    case '10': return 'Accepted'
    case '11': return 'Wrong Answer'
    case '12': return 'Memory Limit Exceeded'
    case '13': return 'Output Limit Exceeded'
    case '14': return 'Time Limit Exceeded'
    case '15': return 'Runtime Error'
    case '20': return 'Compile Error'
    default: return undefined
  }
}

function getVerdictText(response: Record<string, unknown> | null): string | undefined {
  const text = getString(response, ['status_msg', 'statusMsg', 'status', 'statusDisplay', 'status_display', 'status_display_name'])
  if (text) return text
  return mapStatusCode(getString(response, ['status_code', 'statusCode']))
}

function extractSubmissionId(raw: SubmissionDetectionPayload, response: Record<string, unknown> | null): string {
  const fromResponse = getString(response, ['submission_id', 'submissionId', 'id'])
  if (fromResponse) return fromResponse
  const url = raw.requestUrl ?? ''
  const match = url.match(/\/submissions\/(?:detail\/)?(\d+)(?:\/check)?\/?/) ?? raw.pageUrl.match(/\/submissions\/(\d+)\/?/)
  return match?.[1] ?? `leetcode-${Date.now()}`
}

function parseRuntimeMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const match = value.match(/(\d+(?:\.\d+)?)\s*ms/i)
  if (!match) return undefined
  return Math.round(Number(match[1]))
}

function parseMemoryKb(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== 'string') return undefined
  const match = value.match(/(\d+(?:\.\d+)?)\s*(mb|kb)/i)
  if (!match) return undefined
  const amount = Number(match[1])
  return match[2].toLowerCase() === 'mb' ? Math.round(amount * 1024) : Math.round(amount)
}

function extractQuestionTitle(raw: SubmissionDetectionPayload, titleSlug?: string): string | undefined {
  return cleanBrowserProblemTitle(getString(getRecord(raw.meta), ['pageTitle']), {
    platform: 'leetcode-cn',
    platformProblemId: titleSlug,
  }) ?? undefined
}

export function parseLeetcodeSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
  const originalResponse = getRecord(raw.response)
  const response = normalizeResponse(originalResponse)
  if (!response) return null

  const state = getString(response, ['state', 'stateCode', 'state_code'])
    ?? getString(originalResponse, ['state', 'stateCode', 'state_code'])
  if (state && state.toUpperCase() !== 'SUCCESS') return null
  if (hasPendingStatusSignal(originalResponse) || hasPendingStatusSignal(response)) return null

  const verdictText = getVerdictText(response)
  if (!verdictText) return null
  if (LEETCODE_PENDING_PATTERN.test(verdictText)) return null
  const submissionId = extractSubmissionId(raw, response)
  const rawJson = JSON.stringify({
    ...response,
    _leetcodeTitleSlug: getString(response, ['title_slug', 'titleSlug', 'questionTitleSlug'])
      ?? getNestedString(response, [['question', 'titleSlug']])
      ?? getNestedString(originalResponse, [['data', 'question', 'titleSlug']]),
    _leetcodeFrontendQuestionId: getString(response, ['frontend_question_id', 'frontendQuestionId', 'question_id', 'questionId', 'questionFrontendId'])
      ?? getNestedString(response, [['question', 'questionFrontendId']]),
    _leetcodeQuestionTitle: extractQuestionTitle(raw),
  })

  const verdict = normalizeVerdict(verdictText)
  if (verdict === 'TESTING' || verdict === 'UNKNOWN') return null

  return {
    platform: 'leetcode-cn',
    platformSubmissionId: submissionId,
    verdict,
    rawVerdict: verdictText,
    language: getString(response, ['lang', 'lang_name', 'langName', 'pretty_lang', 'code_lang', 'language', 'language_name']),
    submittedAt: nowBeijing(),
    runtimeMs: parseRuntimeMs(getValue(response, ['runtime', 'runtimeDisplay', 'runtime_display', 'status_runtime', 'elapsed_time'])),
    memoryKb: parseMemoryKb(getValue(response, ['memory', 'memoryDisplay', 'memory_display', 'memory_usage', 'status_memory'])),
    sourceUrl: raw.pageUrl,
    rawJson,
  }
}

export function resolveLeetcodeProblemIdentity(
  raw: SubmissionDetectionPayload,
): ProblemIdentity | null {
  const originalResponse = getRecord(raw.response)
  const response = normalizeResponse(originalResponse)
  const titleSlug = getString(response, ['title_slug', 'titleSlug', 'questionTitleSlug'])
    ?? getNestedString(response, [['question', 'titleSlug']])
    ?? getNestedString(originalResponse, [['data', 'question', 'titleSlug']])
    ?? extractLeetcodeTitleSlugFromUrl(raw.pageUrl)

  if (!titleSlug) return null
  return {
    platform: 'leetcode-cn',
    platformProblemId: titleSlug,
    canonicalUrl: `https://leetcode.cn/problems/${titleSlug}/`,
    title: extractQuestionTitle(raw, titleSlug),
    problemIndex: getString(response, ['frontend_question_id', 'frontendQuestionId', 'question_id', 'questionId', 'questionFrontendId'])
      ?? getNestedString(response, [['question', 'questionFrontendId']]),
    confidence: 'url',
  }
}
