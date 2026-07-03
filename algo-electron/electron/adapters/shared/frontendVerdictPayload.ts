import type { SubmissionData } from '../../shared/types'
import { nowBeijing } from '../../shared/time'
import type { SubmissionDetectionPayload } from '../types'
import { extractLanguage, parseMemoryKb, parseRuntimeMs } from './text'
function hasStandaloneLatinToken(value: string, token: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9\\u4e00-\\u9fff])${token}($|[^A-Za-z0-9\\u4e00-\\u9fff])`, 'i').test(value)
}

function hasResultContext(value: string): boolean {
  return /结果|状态|评测|运行|提交|verdict|result|status|judge|submission/i.test(value)
}

function readTestcasePassFraction(value: string): { passed: number; total: number } | null {
  const match = value.match(/通过(?:了)?\s*(\d+)\s*\/\s*(\d+)/i)
  if (!match) return null
  const passed = Number(match[1])
  const total = Number(match[2])
  if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) return null
  return { passed, total }
}

function isNowcoderSelfTestResult(value: string): boolean {
  const text = value.replace(/\s+/g, ' ').trim()
  if (/提交记录|正式提交|submission/i.test(text)) return false
  if (/自测输入|测试输入|自定义输入|自定义测试|输入数据|输出数据/i.test(text)) return true
  if (/(?:自测|调试)\s*(?:结果|运行结果|通过|成功|失败|答案)|样例测试|custom\s*test|sample\s*test/i.test(text)) return true
  if (/(?:自测|调试).{0,80}(?:输入|输出|stdin|stdout|运行结果|样例)/i.test(text)) return true
  if (/\btestcase\b/i.test(text) && /\b(?:self|custom|sample)\b/i.test(text)) return true
  return false
}

function extractNowcoderSubmissionId(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.trim()) return undefined
  try {
    const parsed = new URL(url)
    const id = parsed.searchParams.get('submissionId')
      ?? parsed.searchParams.get('submission_id')
      ?? parsed.searchParams.get('id')
    if (id && /^\d+$/.test(id)) return id
  } catch { /* ignore */ }

  const match = url.match(/[?&](?:submissionId|submission_id|id)=(\d+)\b/)
  return match?.[1]
}

function extractVjudgeSubmissionIdFromLinks(links: unknown): string | undefined {
  if (!Array.isArray(links)) return undefined
  for (const link of links) {
    if (typeof link !== 'string') continue
    const match = link.match(/\/(?:solution|problem\/view\/submission)\/(\d+)\b/)
    if (match) return match[1]
  }
  return undefined
}

function mapFrontendVerdict(raw: string, options: { allowAlias?: boolean } = {}): SubmissionData['verdict'] {
  const value = raw.trim().toLowerCase()
  if (!value) return 'UNKNOWN'
  const testcasePassFraction = readTestcasePassFraction(value)
  if (
    value.includes('部分正确')
    || value.includes('答案错误')
    || value.includes('wrong answer')
    || /未通过(?:本题|全部|所有|测试用例)|(?:没有|没)通过(?:本题|全部|所有|测试用例)|(?:全部|所有)?测试用例.{0,16}未通过|部分(?:测试用例)?(?:正确|通过)/.test(value)
    || (testcasePassFraction && testcasePassFraction.passed < testcasePassFraction.total)
  ) return 'WA'
  if (
    value.includes('答案正确')
    || value.includes('accepted')
    || /恭喜.*通过|已通过|(?:全部|所有)测试用例(?:均)?通过|通过(?:了)?(?:本题|全部|所有)(?:测试用例)?|(^|\s)通过(\s|$)/.test(value)
    || (testcasePassFraction && testcasePassFraction.passed === testcasePassFraction.total)
  ) return 'AC'
  if (value.includes('时间超限') || value.includes('超出时间限制') || value.includes('运行超时') || value.includes('time limit')) return 'TLE'
  if (value.includes('内存超限') || value.includes('超出内存限制') || value.includes('memory limit')) return 'MLE'
  if (value.includes('运行错误') || value.includes('运行时错误') || value.includes('runtime error')) return 'RE'
  if (value.includes('编译错误') || value.includes('compile error') || value.includes('compilation error')) return 'CE'
  if (value.includes('格式错误') || value.includes('presentation error')) return 'PE'
  if (value.includes('输出超限') || value.includes('output limit')) return 'OLE'
  if (value.includes('等待评测') || value.includes('正在评测') || value.includes('评测中') || value.includes('pending') || value.includes('judging') || value.includes('running')) return 'TESTING'
  if (options.allowAlias) {
    if (hasStandaloneLatinToken(raw, 'AC')) return 'AC'
    if (hasStandaloneLatinToken(raw, 'WA')) return 'WA'
    if (hasStandaloneLatinToken(raw, 'TLE')) return 'TLE'
    if (hasStandaloneLatinToken(raw, 'MLE')) return 'MLE'
    if (hasStandaloneLatinToken(raw, 'RE')) return 'RE'
    if (hasStandaloneLatinToken(raw, 'CE')) return 'CE'
    if (hasStandaloneLatinToken(raw, 'PE')) return 'PE'
    if (hasStandaloneLatinToken(raw, 'OLE')) return 'OLE'
  }
  return 'UNKNOWN'
}

export function parseFrontendVerdictPayload(
  raw: SubmissionDetectionPayload,
  platform: string,
  submissionPrefix: string,
): SubmissionData | null {
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as { _source?: unknown; submitId?: unknown; text?: unknown; verdictText?: unknown; links?: unknown; language?: unknown }
    : null
  if (response?._source !== 'frontend-verdict-observer') return null
  if (typeof response.submitId !== 'string' || !response.submitId.trim()) return null

  const text = typeof response.text === 'string' ? response.text : ''
  if (platform === 'nowcoder' && isNowcoderSelfTestResult(text)) return null

  const rawVerdict = typeof response.verdictText === 'string' && response.verdictText.trim()
    ? response.verdictText.trim()
    : text
  const verdictFromText = mapFrontendVerdict(text, { allowAlias: hasResultContext(text) })
  const verdict = verdictFromText !== 'UNKNOWN' && verdictFromText !== 'TESTING'
    ? verdictFromText
    : text.trim() === rawVerdict.trim()
      ? mapFrontendVerdict(rawVerdict, { allowAlias: true })
      : 'UNKNOWN'
  if (verdict === 'UNKNOWN' || verdict === 'TESTING') return null
  const sourceUrl = typeof raw.requestUrl === 'string' && raw.requestUrl.trim()
    ? raw.requestUrl
    : raw.pageUrl
  const officialNowcoderSubmissionId = platform === 'nowcoder'
    ? extractNowcoderSubmissionId(sourceUrl)
    : undefined
  const officialVjudgeSubmissionId = platform === 'vjudge'
    ? extractVjudgeSubmissionIdFromLinks(response.links) ?? extractVjudgeSubmissionIdFromLinks([sourceUrl])
    : undefined
  const officialSubmissionId = officialNowcoderSubmissionId ?? officialVjudgeSubmissionId

  return {
    platform,
    platformSubmissionId: officialSubmissionId
      ? `${submissionPrefix}-${officialSubmissionId}`
      : `${submissionPrefix}-rt-${response.submitId}`,
    verdict,
    rawVerdict,
    language: typeof response.language === 'string' && response.language.trim()
      ? response.language.trim()
      : extractLanguage(text),
    runtimeMs: parseRuntimeMs(text),
    memoryKb: parseMemoryKb(text),
    submittedAt: nowBeijing(),
    sourceUrl,
    rawJson: JSON.stringify({
      _source: 'frontend-verdict-observer',
      text: text.slice(0, 1000),
      links: Array.isArray(response.links) ? response.links.slice(0, 10) : undefined,
    }),
  }
}

