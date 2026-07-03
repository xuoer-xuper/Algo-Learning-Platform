import type { Verdict } from '../../shared/types'

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeGenericVerdict(raw: string): Verdict {
  const value = raw.trim().toLowerCase()
  if (!value) return 'UNKNOWN'
  if (value.includes('答案正确') || value.includes('accepted') || value === 'ac' || value.includes('通过')) return 'AC'
  if (value.includes('部分正确')) return 'WA'
  if (value.includes('答案错误') || value.includes('wrong answer') || value === 'wa') return 'WA'
  if (value.includes('时间超限') || value.includes('超出时间限制') || value.includes('time limit') || value === 'tle') return 'TLE'
  if (value.includes('内存超限') || value.includes('超出内存限制') || value.includes('memory limit') || value === 'mle') return 'MLE'
  if (value.includes('运行错误') || value.includes('运行时错误') || value.includes('runtime error') || value === 're') return 'RE'
  if (value.includes('编译错误') || value.includes('compile error') || value.includes('compilation error') || value === 'ce') return 'CE'
  if (value.includes('格式错误') || value.includes('presentation error') || value === 'pe') return 'PE'
  if (value.includes('输出超限') || value.includes('output limit') || value === 'ole') return 'OLE'
  if (
    value.includes('等待评测')
    || value.includes('正在评测')
    || value.includes('评测中')
    || value.includes('排队')
    || value.includes('pending')
    || value.includes('judging')
    || value.includes('running')
    || value.includes('testing')
    || value.includes('queue')
    || value.includes('compiling')
  ) return 'TESTING'
  if (value.includes('已被覆盖') || value.includes('skipped')) return 'SKIPPED'
  return 'UNKNOWN'
}

export function parseRuntimeMs(raw: string): number | undefined {
  const value = raw.trim().toLowerCase()
  if (!value) return undefined
  const match = value.match(/(\d+(?:\.\d+)?)\s*(ms|s)?/)
  if (!match) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return undefined
  return match[2] === 's' ? Math.round(amount * 1000) : Math.round(amount)
}

export function parseMemoryKb(raw: string): number | undefined {
  const value = raw.trim().toLowerCase()
  if (!value) return undefined
  const match = value.match(/(\d+(?:\.\d+)?)\s*(kb|kib|mb|mib)?/)
  if (!match) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return undefined
  const unit = match[2] ?? 'kb'
  return unit.startsWith('m') ? Math.round(amount * 1024) : Math.round(amount)
}
