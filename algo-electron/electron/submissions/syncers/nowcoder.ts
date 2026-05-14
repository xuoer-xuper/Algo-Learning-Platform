import type { SubmissionData, Verdict } from '../../shared/types'

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

export async function syncNowcoderSubmissions(cookies: string): Promise<SubmissionData[]> {
  const url = 'https://ac.nowcoder.com/acm/contest/my-submission?pageSize=100'

  const resp = await fetch(url, {
    headers: {
      'Cookie': cookies,
      'Referer': 'https://ac.nowcoder.com/',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })

  if (!resp.ok) throw new Error(`Nowcoder API error: ${resp.status}`)

  const json = await resp.json() as { data?: any[] }
  const list = json.data ?? []

  return list.map((s: any) => ({
    platform: 'nowcoder',
    platformSubmissionId: `nc-${s.submissionId ?? s.id}`,
    verdict: mapVerdict(s.statusDesc ?? s.result ?? ''),
    rawVerdict: s.statusDesc ?? s.result ?? '',
    language: s.language ?? '',
    submittedAt: s.submitTime ? new Date(s.submitTime).toISOString().replace('Z', '+08:00') : new Date().toISOString().replace('Z', '+08:00'),
    sourceUrl: `https://ac.nowcoder.com/acm/contest/view-submission/${s.submissionId ?? s.id}`,
    rawJson: JSON.stringify(s),
  }))
}
