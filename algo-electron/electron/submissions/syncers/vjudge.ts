import type { SubmissionData, Verdict } from '../../shared/types'

interface VJSubmission {
  id: number
  oj: string
  problemId: string
  result: string
  memory: string
  time: string
  language: string
  length: number
  submitTime: number
  contestId?: number
}

function mapVerdict(vjResult: string): Verdict {
  const r = vjResult.toUpperCase()
  if (r.includes('ACCEPTED')) return 'AC'
  if (r.includes('WRONG ANSWER') || r.includes('WRONG_ANSWER')) return 'WA'
  if (r.includes('TIME LIMIT') || r.includes('TLE')) return 'TLE'
  if (r.includes('MEMORY LIMIT') || r.includes('MLE')) return 'MLE'
  if (r.includes('RUNTIME ERROR') || r.includes('RE')) return 'RE'
  if (r.includes('COMPILE ERROR') || r.includes('CE')) return 'CE'
  if (r.includes('PRESENTATION ERROR') || r.includes('PE')) return 'PE'
  if (r.includes('OUTPUT LIMIT') || r.includes('OLE')) return 'OLE'
  return 'UNKNOWN'
}

export async function syncVjudgeSubmissions(cookies: string, username: string): Promise<SubmissionData[]> {
  const url = `https://vjudge.net/solution/data?pageSize=100&userName=${encodeURIComponent(username)}`

  const resp = await fetch(url, {
    headers: {
      'Cookie': cookies,
      'Referer': 'https://vjudge.net/',
    },
  })

  if (!resp.ok) throw new Error(`VJudge API error: ${resp.status}`)

  const json = await resp.json() as { data: VJSubmission[] }
  if (!json.data) throw new Error('VJudge API returned no data')

  return json.data.map((s) => ({
    platform: 'vjudge',
    platformSubmissionId: `vj-${s.id}`,
    verdict: mapVerdict(s.result),
    rawVerdict: s.result,
    language: s.language,
    submittedAt: new Date(s.submitTime).toISOString().replace('Z', '+08:00'),
    sourceUrl: `https://vjudge.net/solution/${s.id}`,
    rawJson: JSON.stringify(s),
  }))
}
