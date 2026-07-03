import type { SubmissionData } from '../../../shared/types'
import { nowBeijing } from '../../../shared/time'
import { pickFinalRealtimeSubmission } from '../../../submissions/realtimeSubmissionFilter'
import { normalizeVerdict } from '../../verdictMap'
import type { SubmissionDetectionPayload } from '../../types'
import {
  parseMemoryKb,
  parseRuntimeMs,
  stripHtml,
} from '../../shared/genericSubmission'
import {
  getVjudgePageProblem,
  parseVjudgeProblemText,
  statusCellsMatchPageProblem,
} from './problem'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function pickString(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return stripHtml(value)
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function normalizeVjudgeVerdict(raw: unknown): SubmissionData['verdict'] {
  const text = stripHtml(raw).replace(/\s+/g, ' ').trim()
  if (!text) return 'UNKNOWN'

  const exact = normalizeVerdict(text)
  if (exact !== 'UNKNOWN') return exact
  if (/Waiting|Queue|Pending|Judging|Running|Testing|Compiling|等待|排队|评测中|判题中/i.test(text)) return 'TESTING'
  if (/Accepted|答案正确|\bAC\b/i.test(text)) return 'AC'
  if (/Wrong\s*Answer|答案错误|\bWA\b/i.test(text)) return 'WA'
  if (/Time\s*Limit|时间超限|\bTLE\b/i.test(text)) return 'TLE'
  if (/Memory\s*Limit|内存超限|\bMLE\b/i.test(text)) return 'MLE'
  if (/Runtime\s*Error|运行错误|\bRE\b/i.test(text)) return 'RE'
  if (/Compile\s*Error|Compilation\s*Error|编译错误|\bCE\b/i.test(text)) return 'CE'
  if (/Presentation\s*Error|格式错误|\bPE\b/i.test(text)) return 'PE'
  if (/Output\s*Limit|输出超限|\bOLE\b/i.test(text)) return 'OLE'
  return 'UNKNOWN'
}

function extractVjudgeSubmissionId(raw: SubmissionDetectionPayload, result: Record<string, unknown> | null): string {
  const direct = pickString(result, [
    'id',
    'solutionId',
    'submissionId',
    'runId',
    'solution_id',
    'submission_id',
  ])
  if (/^\d{4,}$/.test(direct)) return direct

  const wrapped = asRecord(raw.response)
  const wrappedId = pickString(wrapped, ['solutionId', 'submissionId', 'runId'])
  if (/^\d{4,}$/.test(wrappedId)) return wrappedId

  const urlMatch = String(raw.requestUrl || '').match(/(?:solution|submission|run)(?:\/|=)(\d{4,})/i)
    ?? String(raw.requestUrl || '').match(/[?&](?:id|solutionId|submissionId|runId)=(\d{4,})/i)
  return urlMatch?.[1] ?? ''
}

function pickVjudgeVerdictText(result: Record<string, unknown> | null): string {
  return pickString(result, [
    'verdict',
    'result',
    'status',
    'statusText',
    'statusName',
    'statusDisplay',
    'displayStatus',
    'judgeStatus',
    'judgeResult',
    'ojStatus',
    'message',
  ])
}

function parseVjudgeProblemFromResult(
  result: Record<string, unknown> | null,
): ReturnType<typeof parseVjudgeProblemText> {
  if (!result) return null
  const problemText = pickString(result, ['problem', 'problemId', 'problemNum', 'probNum', 'num'])
  const oj = pickString(result, ['oj', 'OJ', 'originOJ', 'sourceOJ', 'sourcePlatform'])
  const probNum = pickString(result, ['probNum', 'problemNum', 'num', 'sourceProblemId'])
  return parseVjudgeProblemText(problemText)
    ?? (oj && probNum
      ? parseVjudgeProblemText(`${oj}-${probNum}`)
      : null)
}

function isVjudgeSolutionDetailDomResult(result: Record<string, unknown>): boolean {
  const detailText = pickString(result, ['_domText', 'text', 'detailText'])
  const detailLinks = Array.isArray(result._domLinks) ? result._domLinks.map(stripHtml).join(' ') : ''
  const evidence = `${detailText} ${detailLinks}`
  const id = pickString(result, ['id', 'solutionId', 'submissionId', 'runId'])
  const visibleIdPattern = id
    ? new RegExp(`(?:#\\s*${id}\\b|\\bID\\s*[:#]?\\s*${id}\\b|/solution/${id}\\b)`, 'i')
    : null
  const labelMatches = evidence.match(/评测结果|远程提交ID|耗时|内存消耗|提交时间|Result|Runtime|Memory|Language|Submitted/gi) ?? []
  return labelMatches.length >= 2 && Boolean(visibleIdPattern?.test(evidence))
}

function parseNumberOrUnit(value: unknown, parseUnit: (raw: string) => number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value.trim()) return parseUnit(value)
  return undefined
}

export function parseVjudgeStatusData(raw: SubmissionDetectionPayload): SubmissionData | null {
  if (!/\/status\/data\/?/.test(String(raw.requestUrl || ''))) return null
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as { data?: unknown }
    : null
  if (!Array.isArray(response?.data)) return null

  const submissions: SubmissionData[] = []
  const latestRows = response.data.slice(0, 1)
  for (const row of latestRows) {
    if (!Array.isArray(row)) continue
    const cells = row.map(stripHtml)
    const idCell = cells.find(cell => /^\d{4,}$/.test(cell))
    if (!idCell) continue
    const verdictCell = cells.find(cell => normalizeVerdict(cell) !== 'UNKNOWN' && !/^\d+$/.test(cell))
    if (!verdictCell) continue
    const language = cells.find(cell => /c\+\+|java|python|go|rust|pascal|clang|gcc/i.test(cell))
    const runtime = cells.find(cell => /\d+(?:\.\d+)?\s*(ms|s)\b/i.test(cell))
    const memory = cells.find(cell => /\d+(?:\.\d+)?\s*(kb|mb|kib|mib)\b/i.test(cell))
    const problem = cells.find(cell => /^[A-Za-z][A-Za-z0-9_+.-]*[-\s]\S+/.test(cell))
    const parsedProblem = parseVjudgeProblemText(problem)
    if (!statusCellsMatchPageProblem(raw, cells, parsedProblem)) continue

    submissions.push({
      platform: 'vjudge',
      platformSubmissionId: `vj-${idCell}`,
      verdict: normalizeVerdict(verdictCell),
      rawVerdict: verdictCell,
      language,
      runtimeMs: runtime ? parseRuntimeMs(runtime) : undefined,
      memoryKb: memory ? parseMemoryKb(memory) : undefined,
      submittedAt: nowBeijing(),
      sourceUrl: `https://vjudge.net/solution/${idCell}`,
      rawJson: JSON.stringify({
        row: { texts: cells },
        _vjudgeProblem: problem,
        ...(parsedProblem
          ? {
            _vjudgeProblemId: parsedProblem.problemId,
            _vjudgeSourcePlatform: parsedProblem.sourcePlatform,
            _vjudgeSourceProblemId: parsedProblem.sourceProblemId,
          }
          : {}),
      }),
      ...(parsedProblem ? { _vjudgeProblemId: parsedProblem.problemId } : {}),
    } as SubmissionData & { _vjudgeProblemId?: string })
  }

  return pickFinalRealtimeSubmission(submissions)
}

export function parseVjudgeSolutionData(raw: SubmissionDetectionPayload): SubmissionData | null {
  const response = asRecord(raw.response)
  if (!response) return null
  const source = String(response?._source || '')
  if (source !== 'vjudge-solution-data' && source !== 'vjudge-solution-detail-dom') return null

  const result = asRecord(response.result)
  if (!result) return null
  if (source === 'vjudge-solution-detail-dom' && !isVjudgeSolutionDetailDomResult(result)) return null

  const id = extractVjudgeSubmissionId(raw, result)
  if (!id) return null

  const rawVerdict = pickVjudgeVerdictText(result)
  const verdict = normalizeVjudgeVerdict(rawVerdict)
  if (verdict === 'TESTING' || verdict === 'UNKNOWN') return null

  const parsedProblem = parseVjudgeProblemFromResult(result)
    ?? parseVjudgeProblemText(getVjudgePageProblem(raw.pageUrl)?.problemId)
  const problem = parsedProblem
    ? `${parsedProblem.sourcePlatform}-${parsedProblem.sourceProblemId}`
    : pickString(result, ['problem', 'problemId', 'problemNum', 'probNum', 'num'])
  const submittedAt = pickString(result, [
    'submittedAt',
    'submitTime',
    'submittedTime',
    'submissionTime',
    'createdAt',
  ])

  return {
    platform: 'vjudge',
    platformSubmissionId: `vj-${id}`,
    verdict,
    rawVerdict,
    language: pickString(result, ['language', 'languageName', 'lang', 'langName', 'compiler']),
    runtimeMs: parseNumberOrUnit(
      result.time ?? result.runtime ?? result.runTime ?? result.timeCost ?? result.runtimeMs,
      parseRuntimeMs,
    ),
    memoryKb: parseNumberOrUnit(
      result.memory ?? result.memoryCost ?? result.memoryKb ?? result.mem,
      parseMemoryKb,
    ),
    submittedAt: submittedAt || nowBeijing(),
    sourceUrl: `https://vjudge.net/solution/${id}`,
    rawJson: JSON.stringify({
      _source: source,
      result,
      _vjudgeProblem: problem,
      ...(parsedProblem
        ? {
          _vjudgeProblemId: parsedProblem.problemId,
          _vjudgeSourcePlatform: parsedProblem.sourcePlatform,
          _vjudgeSourceProblemId: parsedProblem.sourceProblemId,
        }
        : {}),
    }),
    ...(parsedProblem ? { _vjudgeProblemId: parsedProblem.problemId } : {}),
  } as SubmissionData & { _vjudgeProblemId?: string }
}
