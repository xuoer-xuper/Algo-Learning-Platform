import type { SubmissionData, Verdict } from '../../shared/types'
import { toBeijing, nowBeijing } from '../../shared/time'

function mapVerdict(result: string): Verdict {
  const r = result.toLowerCase()
  if (r.includes('accepted') || r === 'ac') return 'AC'
  if (r.includes('wrong answer') || r === 'wa') return 'WA'
  if (r.includes('time limit') || r === 'tle') return 'TLE'
  if (r.includes('memory limit') || r === 'mle') return 'MLE'
  if (r.includes('runtime error') || r === 're') return 'RE'
  if (r.includes('compile error') || r === 'ce') return 'CE'
  return 'UNKNOWN'
}

export async function syncAcwingSubmissions(cookies: string): Promise<SubmissionData[]> {
  const url = 'https://www.acwing.com/api/question/submission_list/'

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json',
      'Referer': 'https://www.acwing.com/',
    },
    body: JSON.stringify({ page: 1, count: 100 }),
  })

  if (!resp.ok) throw new Error(`AcWing API error: ${resp.status}`)

  const json = await resp.json() as { data?: { submission_list?: any[] } }
  const list = json.data?.submission_list ?? []

  return list.map((s: any) => ({
    platform: 'acwing',
    platformSubmissionId: `ac-${s.id}`,
    verdict: mapVerdict(s.status ?? s.result ?? ''),
    rawVerdict: s.status ?? s.result ?? '',
    language: s.language ?? '',
    submittedAt: s.submit_time ? toBeijing(new Date(s.submit_time)) : nowBeijing(),
    sourceUrl: `https://www.acwing.com/problem/submission/${s.id}/`,
    rawJson: JSON.stringify(s),
  }))
}
