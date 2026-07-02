import type { Verdict } from '../shared/types'

const verdictMap: Record<string, Verdict> = {
  accepted: 'AC',
  ac: 'AC',
  'accept': 'AC',
  '答案正确': 'AC',
  '通过': 'AC',
  'wrong answer': 'WA',
  wa: 'WA',
  '答案错误': 'WA',
  'time limit exceeded': 'TLE',
  tle: 'TLE',
  '超出时间限制': 'TLE',
  'memory limit exceeded': 'MLE',
  mle: 'MLE',
  '超出内存限制': 'MLE',
  'runtime error': 'RE',
  re: 'RE',
  '运行错误': 'RE',
  'compile error': 'CE',
  ce: 'CE',
  'compilation error': 'CE',
  '编译错误': 'CE',
  'presentation error': 'PE',
  pe: 'PE',
  'output limit exceeded': 'OLE',
  ole: 'OLE',
  'skipped': 'SKIPPED',
  'pending': 'TESTING',
  'running': 'TESTING',
  'judging': 'TESTING',
  'testing': 'TESTING',
  'queued': 'TESTING',
  'in queue': 'TESTING',
  'queueing': 'TESTING',
  'compiling': 'TESTING',
}

export function normalizeVerdict(raw: unknown): Verdict {
  if (typeof raw !== 'string') return 'UNKNOWN'
  const key = raw.trim().toLowerCase()
  if (!key) return 'UNKNOWN'
  if (key.includes('waiting') || key.includes('queue') || key.includes('judging') || key.includes('running') || key.includes('testing') || key.includes('compiling')) {
    return 'TESTING'
  }
  return verdictMap[key] ?? 'UNKNOWN'
}
