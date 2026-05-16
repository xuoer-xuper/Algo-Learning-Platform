import { BrowserHost } from '../../browser/BrowserHost'
import type { SubmissionData, Verdict } from '../../shared/types'
import { nowBeijing } from '../../shared/time'

export interface ScrapeResult {
  submissions: SubmissionData[]
  problemIds: Map<number, string> // 行索引 → 平台题号
}

export async function scrapeCurrentPage(browserHost: BrowserHost): Promise<SubmissionData[] | null> {
  const url = browserHost.getUrl()
  if (url.includes('acwing.com')) return scrapeAcwing(browserHost)
  if (url.includes('nowcoder.com')) return scrapeNowcoder(browserHost)
  if (url.includes('vjudge.net')) return scrapeVjudge(browserHost)
  return null
}

function mapVerdict(result: string): Verdict {
  const r = result.trim().toLowerCase()
  if (r.includes('答案正确') || r.includes('通过') || r.includes('accepted')) return 'AC'
  if (r.includes('答案错误') || r.includes('wrong answer') || r.includes('wrong')) return 'WA'
  if (r.includes('时间超限') || r.includes('超出时间限制') || r.includes('运行超时') || r.includes('time limit')) return 'TLE'
  if (r.includes('内存超限') || r.includes('超出内存限制') || r.includes('memory limit')) return 'MLE'
  if (r.includes('超出输出限制') || r.includes('output limit')) return 'OLE'
  if (r.includes('运行错误') || r.includes('运行时错误') || r.includes('段错误') || r.includes('runtime error')) return 'RE'
  if (r.includes('编译错误') || r.includes('compile error') || r.includes('compilation error')) return 'CE'
  if (r.includes('格式错误') || r.includes('presentation error')) return 'PE'
  if (r.includes('排队中') || r.includes('评测中') || r.includes('testing')) return 'TESTING'
  return 'UNKNOWN'
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex(h => keywords.some(k => h.toLowerCase().includes(k.toLowerCase())))
}

function extractStableId(links: string[], prefix: string, fallbackIndex: number): string {
  for (const link of links) {
    if (!link) continue
    const m = link.match(/\/(\d{4,})\/?$/)
    if (m) return `${prefix}-${m[1]}`
  }
  return `${prefix}-unknown-${fallbackIndex}`
}

// --- AcWing ---

async function scrapeAcwing(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const data = await browserHost.executeScript(`
    (() => {
      const table = document.querySelector('table')
      if (!table) return { error: 'no table' }
      const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(c => {
        const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
      })
      const rows = []
      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 2) continue
        rows.push({
          texts: Array.from(cells).map(c => {
            const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
          }),
          links: Array.from(cells).map(c => { const a = c.querySelector('a'); return a ? a.href : '' })
        })
      }
      return { headers, rows }
    })()
  `)

  if (!data || data.error || !data.rows?.length) return []

  const h = data.headers || []
  const vIdx = findColumnIndex(h, ['状态', 'result', 'verdict'])
  const lIdx = findColumnIndex(h, ['语言', 'language'])

  return data.rows.map((item: any, i: number) => {
    const c = item.texts || []
    const l = item.links || []
    return {
      platform: 'acwing',
      platformSubmissionId: extractStableId(l, 'ac', i),
      verdict: mapVerdict(vIdx >= 0 ? c[vIdx] : c[0]),
      rawVerdict: vIdx >= 0 ? c[vIdx] : c[0],
      language: lIdx >= 0 ? c[lIdx] : '',
      submittedAt: nowBeijing(),
      sourceUrl: l.find((x: string) => x) || '',
    }
  })
}

// --- 牛客（单页） ---

async function scrapeNowcoder(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const data = await browserHost.executeScript(`
    (() => {
      const table = document.querySelector('table')
      if (!table) return { error: 'no table' }
      const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(c => {
        const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
      })
      const rows = []
      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 2) continue
        rows.push({
          texts: Array.from(cells).map(c => {
            const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
          }),
          links: Array.from(cells).map(c => { const a = c.querySelector('a'); return a ? a.href : '' })
        })
      }
      return { headers, rows }
    })()
  `)

  if (!data || data.error || !data.rows?.length) return []

  const h = data.headers || []
  const idIdx = findColumnIndex(h, ['运行ID'])
  const probIdx = findColumnIndex(h, ['题号'])
  const verdictIdx = findColumnIndex(h, ['运行结果'])
  const langIdx = findColumnIndex(h, ['使用语言'])
  const runtimeIdx = findColumnIndex(h, ['运行时间'])
  const memoryIdx = findColumnIndex(h, ['使用内存'])

  return data.rows.map((item: any, i: number) => {
    const c = item.texts || []
    const l = item.links || []
    return {
      platform: 'nowcoder',
      platformSubmissionId: (idIdx >= 0 && c[idIdx]) ? `nc-${c[idIdx]}` : extractStableId(l, 'nc', i),
      verdict: mapVerdict(verdictIdx >= 0 ? c[verdictIdx] : ''),
      rawVerdict: verdictIdx >= 0 ? c[verdictIdx] : '',
      language: langIdx >= 0 ? c[langIdx] : '',
      runtimeMs: runtimeIdx >= 0 ? parseInt(c[runtimeIdx]) || undefined : undefined,
      memoryKb: memoryIdx >= 0 ? parseInt(c[memoryIdx]) || undefined : undefined,
      submittedAt: nowBeijing(),
      sourceUrl: l.find((x: string) => x) || '',
      _ncProbLetter: probIdx >= 0 ? c[probIdx] : undefined,
    } as any
  })
}

// --- VJudge（单页） ---

async function scrapeVjudge(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const data = await browserHost.executeScript(`
    (() => {
      const tables = document.querySelectorAll('table')
      if (!tables.length) return { error: 'no table' }
      // 找到提交记录表：表头包含提交相关列的那个
      let targetTable = null
      for (const t of tables) {
        const ths = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent.trim().toLowerCase())
        const hasId = ths.some(t => t === 'id' || t === 'run id' || t.includes('run'))
        const hasResult = ths.some(t => t.includes('result') || t.includes('评测结果') || t.includes('verdict'))
        if (hasId && hasResult) {
          targetTable = t
          break
        }
      }
      if (!targetTable) {
        // 兜底：找行数最多的 table
        let maxRows = 0
        for (const t of tables) {
          const rowCount = t.querySelectorAll('tbody tr').length
          if (rowCount > maxRows) { maxRows = rowCount; targetTable = t }
        }
      }
      if (!targetTable) return { error: 'no submission table' }
      const headerCells = targetTable.querySelectorAll('thead th, thead td')
      const headers = Array.from(headerCells).map(c => {
        const firstText = Array.from(c.childNodes).find(n => n.nodeType === 3)
        return (firstText && firstText.textContent ? firstText.textContent.trim() : '').split('\\n')[0].trim() || c.textContent.trim().split('\\n')[0].trim()
      })
      const rows = []
      for (const row of targetTable.querySelectorAll('tbody tr')) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 3) continue
        rows.push({
          texts: Array.from(cells).map(c => {
            const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
          }),
          links: Array.from(cells).map(c => { const a = c.querySelector('a'); return a ? a.href : '' }),
          rowId: row.id || row.getAttribute('data-id') || row.getAttribute('data-runid') || ''
        })
      }
      return { headers, rows }
    })()
  `)

  if (!data || data.error || !data.rows?.length) return []

  // 按列头名匹配列序
  const h = data.headers || []
  const idIdx = findColumnIndex(h, ['ID'])
  const vIdx = findColumnIndex(h, ['评测结果', 'Result'])
  const lIdx = findColumnIndex(h, ['语言', 'Language'])
  const rtIdx = findColumnIndex(h, ['耗时', 'Time'])
  const memIdx = findColumnIndex(h, ['内存', 'Memory'])

  const seen = new Set<string>()
  const results: SubmissionData[] = []

  for (let i = 0; i < data.rows.length; i++) {
    const c = data.rows[i].texts || []
    const l = data.rows[i].links || []
    const subId = (idIdx >= 0 && c[idIdx]) ? `vj-${c[idIdx]}` : extractStableId(l, 'vj', i)
    const lang = lIdx >= 0 ? c[lIdx] || '' : ''
    const verdict = vIdx >= 0 ? c[vIdx] || '' : ''
    const key = `${subId}-${verdict}-${lang}`
    if (seen.has(key)) continue
    seen.add(key)

    results.push({
      platform: 'vjudge',
      platformSubmissionId: subId,
      verdict: mapVerdict(verdict),
      rawVerdict: verdict,
      language: lang,
      runtimeMs: rtIdx >= 0 ? parseInt(c[rtIdx]) || undefined : undefined,
      memoryKb: memIdx >= 0 ? Math.round(parseFloat(c[memIdx]) * 1024) || undefined : undefined,
      submittedAt: nowBeijing(),
      sourceUrl: l.find((x: string) => x) || '',
    })
  }

  return results
}
