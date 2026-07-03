import type { SubmissionData } from '../../../shared/types'
import { nowBeijing } from '../../../shared/time'
import type { SubmissionDetectionPayload } from '../../types'
import {
  parseMemoryKb,
  parseRuntimeMs,
} from '../../shared/genericSubmission'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function normalizeNowcoderJudgeVerdict(result: Record<string, unknown>): SubmissionData['verdict'] {
  const status = Number(result.status ?? result.statusCode)
  const text = pickString(result, [
    'judgeReplyDesc',
    'enJudgeReplyDesc',
    'desc',
    'enDesc',
    'memo',
    'enMemo',
  ]).toLowerCase()
  const testcasePassFraction = text.match(/通过(?:了)?\s*(\d+)\s*\/\s*(\d+)/i)
  const passed = testcasePassFraction ? Number(testcasePassFraction[1]) : undefined
  const total = testcasePassFraction ? Number(testcasePassFraction[2]) : undefined

  if (Number.isFinite(status)) {
    if (status < 3) return 'TESTING'
  }
  if (
    /答案错误|wrong answer|未通过(?:本题|全部|所有|测试用例)|(?:没有|没)通过(?:本题|全部|所有|测试用例)|(?:全部|所有)?测试用例.{0,16}未通过|部分(?:测试用例)?(?:正确|通过)/.test(text)
    || (Number.isFinite(passed) && Number.isFinite(total) && Number(total) > 0 && Number(passed) < Number(total))
  ) return 'WA'
  if (Number.isFinite(status)) {
    if (status === 5) return 'AC'
    if (status === 6) return 'TLE'
    if (status === 12) return 'CE'
  }
  if (
    /答案正确|accepted|恭喜.*通过|已通过|(?:全部|所有)测试用例(?:均)?通过|通过(?:了)?(?:本题|全部|所有)(?:测试用例)?/.test(text)
    || (Number.isFinite(passed) && Number.isFinite(total) && Number(total) > 0 && Number(passed) === Number(total))
  ) return 'AC'
  if (/时间超限|运行超时|time limit/.test(text)) return 'TLE'
  if (/内存超限|memory limit/.test(text)) return 'MLE'
  if (/运行错误|runtime error/.test(text)) return 'RE'
  if (/编译错误|compile error|compilation error/.test(text)) return 'CE'
  if (/格式错误|presentation error/.test(text)) return 'PE'
  if (/输出超限|output limit/.test(text)) return 'OLE'
  if (Number.isFinite(status) && status >= 3) return status === 4 ? 'WA' : 'UNKNOWN'
  return 'UNKNOWN'
}

function parseNumberOrUnit(
  value: unknown,
  parseUnit: (raw: string) => number | undefined,
): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value.trim()) return parseUnit(value)
  return undefined
}

export function parseNowcoderJudgeStatusPayload(raw: SubmissionDetectionPayload): SubmissionData | null {
  const response = asRecord(raw.response)
  if (response?._source !== 'nowcoder-judge-status') return null
  if (typeof response.submitId !== 'string' || !response.submitId.trim()) return null

  const result = asRecord(response.result)
  if (!result) return null
  if (result.isSelfTest === true || result.isSelfTest === 'true' || result.submitType === 2) return null

  const verdict = normalizeNowcoderJudgeVerdict(result)
  if (verdict === 'TESTING' || verdict === 'UNKNOWN') return null

  const sourceUrl = typeof raw.requestUrl === 'string' && raw.requestUrl.trim()
    ? raw.requestUrl
    : raw.pageUrl
  const submissionId = pickString(result, ['submissionId', 'submission_id'])
  const judgeId = pickString(result, ['id'])
  const rawVerdict = pickString(result, ['judgeReplyDesc', 'enJudgeReplyDesc', 'desc', 'enDesc', 'memo', 'enMemo'])
    || pickString(result, ['status'])

  return {
    platform: 'nowcoder',
    platformSubmissionId: /^\d+$/.test(submissionId)
      ? `nc-${submissionId}`
      : `nc-rt-${response.submitId}-${judgeId || 'judge'}`,
    verdict,
    rawVerdict,
    language: typeof response.language === 'string' && response.language.trim()
      ? response.language.trim()
      : pickString(result, ['languageName', 'language']),
    runtimeMs: parseNumberOrUnit(result.timeConsumption ?? result.runtime ?? result.time, parseRuntimeMs),
    memoryKb: parseNumberOrUnit(result.memoryConsumption ?? result.memory, parseMemoryKb),
    submittedAt: nowBeijing(),
    sourceUrl,
    rawJson: JSON.stringify({
      _source: 'nowcoder-judge-status',
      result,
    }),
  }
}
