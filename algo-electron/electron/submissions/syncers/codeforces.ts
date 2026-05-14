import type { SubmissionData, Verdict } from '../../shared/types'

interface CFSubmission {
  id: number
  contestId: number
  problem: {
    contestId: number
    index: string
    name: string
  }
  verdict: string
  programmingLanguage: string
  timeConsumedMillis: number
  memoryConsumedBytes: number
  creationTimeSeconds: number
}

function mapVerdict(cfVerdict: string): Verdict {
  switch (cfVerdict) {
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

export async function syncCodeforcesSubmissions(handle: string): Promise<SubmissionData[]> {
  const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=100`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Codeforces API error: ${resp.status}`)

  const json = await resp.json() as { status: string; result: CFSubmission[] }
  if (json.status !== 'OK') throw new Error('Codeforces API returned non-OK status')

  return json.result.map((s) => ({
    platform: 'codeforces',
    platformSubmissionId: String(s.id),
    verdict: mapVerdict(s.verdict),
    rawVerdict: s.verdict,
    language: s.programmingLanguage,
    submittedAt: new Date(s.creationTimeSeconds * 1000).toISOString().replace('Z', '+08:00'),
    runtimeMs: s.timeConsumedMillis,
    memoryKb: Math.round(s.memoryConsumedBytes / 1024),
    sourceUrl: `https://codeforces.com/contest/${s.contestId}/submission/${s.id}`,
    rawJson: JSON.stringify(s),
  }))
}
