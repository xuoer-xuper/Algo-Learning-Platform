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
  if (url.includes('pintia.cn')) return scrapePta(browserHost)
  return null
}

function mapVerdict(result: string): Verdict {
  const r = result.trim().toLowerCase()
  if (!r) return 'UNKNOWN'
  if (r.includes('答案正确') || r.includes('通过') || r.includes('accepted')) return 'AC'
  if (r.includes('部分正确')) return 'WA'
  if (r.includes('答案错误') || r.includes('wrong answer') || r.includes('wrong')) return 'WA'
  if (r.includes('时间超限') || r.includes('超出时间限制') || r.includes('运行超时') || r.includes('time limit')) return 'TLE'
  if (r.includes('内存超限') || r.includes('超出内存限制') || r.includes('memory limit')) return 'MLE'
  if (r.includes('输出超限') || r.includes('超出输出限制') || r.includes('output limit')) return 'OLE'
  if (r.includes('段错误') || r.includes('浮点错误') || r.includes('非零返回') || r.includes('多种错误') || r.includes('运行错误') || r.includes('运行时错误') || r.includes('runtime error')) return 'RE'
  if (r.includes('编译错误') || r.includes('compile error') || r.includes('compilation error')) return 'CE'
  if (r.includes('格式错误') || r.includes('presentation error')) return 'PE'
  if (r.includes('等待评测') || r.includes('正在评测') || r.includes('排队中') || r.includes('评测中') || r.includes('testing') || r.includes('pending') || r.includes('judging') || r.includes('running')) return 'TESTING'
  if (r.includes('已被覆盖') || r.includes('内部错误') || r.includes('skipped')) return 'SKIPPED'
  const abbrMap: Record<string, Verdict> = { ac: 'AC', wa: 'WA', tle: 'TLE', mle: 'MLE', re: 'RE', ce: 'CE', pe: 'PE', ole: 'OLE' }
  if (abbrMap[r]) return abbrMap[r]
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

async function scrapePta(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const currentUrl = browserHost.getUrl()
  const urlSetIdMatch = currentUrl.match(/\/problem-sets\/(\d+)/)
  const urlSetId = urlSetIdMatch ? urlSetIdMatch[1] : null

  const data = await browserHost.executeScript(`
    (() => {
      const tables = document.querySelectorAll('table')
      if (!tables.length) return { error: 'no table' }
      let targetTable = null
      for (const t of tables) {
        const ths = Array.from(t.querySelectorAll('thead th, thead td')).map(th => th.textContent.trim())
        const hasResult = ths.some(t => t.includes('评测结果') || t.includes('结果') || t.includes('Score') || t.includes('Result') || t.includes('状态') || t.includes('Status'))
        const hasSubmit = ths.some(t => t.includes('提交') || t.includes('Submit') || t.includes('语言') || t.includes('Language') || t.includes('编译器') || t.includes('Compiler'))
        if (hasResult || hasSubmit) {
          targetTable = t
          break
        }
      }
      if (!targetTable) {
        let maxRows = 0
        for (const t of tables) {
          const rowCount = t.querySelectorAll('tbody tr').length
          if (rowCount > maxRows) { maxRows = rowCount; targetTable = t }
        }
      }
      if (!targetTable) return { error: 'no submission table' }
      let headers = Array.from(targetTable.querySelectorAll('thead th, thead td')).map(c => {
        const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
      })
      if (!headers.length || headers.length < 2) {
        const firstRow = targetTable.querySelector('tr')
        if (firstRow) {
          headers = Array.from(firstRow.querySelectorAll('th, td')).map(c => {
            const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
          })
        }
      }
      const rows = []
      for (const row of targetTable.querySelectorAll('tbody tr')) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 2) continue
        rows.push({
          texts: Array.from(cells).map(c => {
            const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
          }),
          links: Array.from(cells).map(c => { const a = c.querySelector('a'); return a ? a.href : '' }),
          allLinks: Array.from(cells).map(c => Array.from(c.querySelectorAll('a')).map(a => a.href)),
          htmls: Array.from(cells).map(c => c.innerHTML),
          classNames: Array.from(cells).map(c => c.className || '')
        })
      }
      return { headers, rows }
    })()
  `)

  if (!data || data.error || !data.rows?.length) return []

  const h = data.headers || []
  const idIdx = findColumnIndex(h, ['提交编号', 'Submission ID', 'ID'])
  let vIdx = findColumnIndex(h, ['评测结果', '结果', 'Score', 'Result', '状态', 'Status', '评判结果', '得分'])
  const lIdx = findColumnIndex(h, ['编译器', '语言', 'Language', 'Compiler'])
  const rtIdx = findColumnIndex(h, ['耗时', '运行时间', 'Time'])
  const memIdx = findColumnIndex(h, ['内存', '使用内存', 'Memory'])
  const probIdx = findColumnIndex(h, ['题目', '问题', 'Problem'])

  if (vIdx === -1 && data.rows?.length) {
    const PTA_VERDICT_KEYWORDS = ['答案正确', '部分正确', '答案错误', '运行超时', '内存超限', '输出超限', '段错误', '浮点错误', '非零返回', '多种错误', '运行时错误', '编译错误', '格式错误', '等待评测', '正在评测', '已被覆盖', '内部错误', 'accepted', 'wrong', 'time limit', 'memory limit', 'runtime', 'compile', 'presentation', 'output limit']
    for (let col = 0; col < (data.rows[0].texts?.length || 0); col++) {
      let matchCount = 0
      for (const row of data.rows) {
        const cellText = (row.texts?.[col] || '').toLowerCase()
        if (PTA_VERDICT_KEYWORDS.some(k => cellText.includes(k.toLowerCase()))) matchCount++
      }
      if (matchCount > 0) {
        vIdx = col
        break
      }
    }
  }

  if (vIdx === -1 && data.rows?.length) {
    for (let col = 0; col < (data.rows[0].classNames?.length || 0); col++) {
      const cls = (data.rows[0].classNames?.[col] || '').toLowerCase()
      if (cls.includes('result') || cls.includes('verdict') || cls.includes('status') || cls.includes('score')) {
        vIdx = col
        break
      }
    }
  }

  const PTA_TYPE_LINK = /problemSetProblemId[=\/](\d+)/
  const PTA_PROBLEM_LINK = /\/problem-sets\/(\d+)\/(?:problems|exam\/problems)\/(\d+)/
  const PTA_PROBLEM_ID_ATTR = /data-problem-id="(\d+)"/
  const PTA_SET_ID_ATTR = /data-set-id="(\d+)"/

  const seen = new Set<string>()
  const results: SubmissionData[] = []

  for (let i = 0; i < data.rows.length; i++) {
    const c = data.rows[i].texts || []
    const l = data.rows[i].links || []
    const allLinks: string[][] = data.rows[i].allLinks || []
    const htmls: string[] = data.rows[i].htmls || []
    const subId = (idIdx >= 0 && c[idIdx]) ? `pta-${c[idIdx]}` : extractStableId(l, 'pta', i)
    const lang = lIdx >= 0 ? c[lIdx] || '' : ''
    const verdict = vIdx >= 0 ? c[vIdx] || '' : ''
    const key = `${subId}-${verdict}-${lang}`
    if (seen.has(key)) continue
    seen.add(key)

    let finalVerdict = mapVerdict(verdict)

    let ptaProblemId: string | undefined
    let extractedSetId: string | undefined
    let extractedProblemId: string | undefined

    const allCellLinks = (probIdx >= 0 ? allLinks[probIdx] || [] : l)
      .concat(...allLinks)

    for (const link of allCellLinks) {
      const tm = link.match(PTA_TYPE_LINK)
      if (tm) {
        extractedProblemId = tm[1]
        const setM = link.match(/\/problem-sets\/(\d+)\//)
        if (setM) extractedSetId = setM[1]
        break
      }
    }

    if (!extractedProblemId) {
      for (const link of allCellLinks) {
        const m = link.match(PTA_PROBLEM_LINK)
        if (m) {
          extractedSetId = m[1]
          extractedProblemId = m[2]
          break
        }
      }
    }

    if (!extractedProblemId && probIdx >= 0 && htmls[probIdx]) {
      const attrM = htmls[probIdx].match(PTA_PROBLEM_ID_ATTR)
      if (attrM) extractedProblemId = attrM[1]
      const setM = htmls[probIdx].match(PTA_SET_ID_ATTR)
      if (setM) extractedSetId = setM[1]
    }
    if (!extractedProblemId && probIdx >= 0) {
      const probText = c[probIdx]
      const numMatch = probText.match(/(\d+)/)
      if (numMatch) extractedProblemId = numMatch[1]
    }

    if (extractedProblemId) {
      const setId = extractedSetId || urlSetId
      if (setId) {
        ptaProblemId = `${setId}-${extractedProblemId}`
      } else {
        ptaProblemId = extractedProblemId
      }
    }

    results.push({
      platform: 'pta',
      platformSubmissionId: subId,
      verdict: finalVerdict,
      rawVerdict: verdict,
      language: lang,
      runtimeMs: rtIdx >= 0 ? parseInt(c[rtIdx]) || undefined : undefined,
      memoryKb: memIdx >= 0 ? parseInt(c[memIdx]) || undefined : undefined,
      submittedAt: nowBeijing(),
      sourceUrl: l.find((x: string) => x) || '',
      rawJson: ptaProblemId ? JSON.stringify({ _ptaProblemId: ptaProblemId }) : undefined,
    } as any)
  }

  return results
}
