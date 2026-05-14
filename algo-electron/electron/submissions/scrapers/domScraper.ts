import { BrowserHost } from '../../browser/BrowserHost'
import type { SubmissionData, Verdict } from '../../shared/types'

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
  if (r.includes('时间超限') || r.includes('超出时间限制') || r.includes('time limit')) return 'TLE'
  if (r.includes('内存超限') || r.includes('超出内存限制') || r.includes('memory limit')) return 'MLE'
  if (r.includes('超出输出限制') || r.includes('output limit')) return 'OLE'
  if (r.includes('运行错误') || r.includes('运行时错误') || r.includes('段错误') || r.includes('runtime error')) return 'RE'
  if (r.includes('编译错误') || r.includes('compile error') || r.includes('compilation error')) return 'CE'
  if (r.includes('格式错误') || r.includes('presentation error')) return 'PE'
  if (r.includes('排队中') || r.includes('评测中') || r.includes('testing')) return 'TESTING'
  if (r.includes('judge') || r.includes('评测失败') || r.includes('remote')) return 'UNKNOWN'
  return 'UNKNOWN'
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex(h => keywords.some(k => h.includes(k)))
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
      const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(c => c.textContent.trim())
      const rows = []
      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 2) continue
        rows.push({
          texts: Array.from(cells).map(c => c.textContent.trim()),
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
      submittedAt: new Date().toISOString(),
      sourceUrl: l.find((x: string) => x) || '',
    }
  })
}

// --- 牛客（自动翻页） ---

async function scrapeNowcoder(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const allRows: any[] = []
  let headers: string[] = []

  for (let page = 0; page < 200; page++) {
    const data = await browserHost.executeScript(`
      (() => {
        const table = document.querySelector('table')
        if (!table) return { error: 'no table' }
        const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(c => c.textContent.trim())
        const rows = []
        for (const row of table.querySelectorAll('tbody tr')) {
          const cells = row.querySelectorAll('td')
          if (cells.length < 2) continue
          rows.push({
            texts: Array.from(cells).map(c => c.textContent.trim()),
            links: Array.from(cells).map(c => { const a = c.querySelector('a'); return a ? a.href : '' })
          })
        }
        // 牛客翻页：找当前激活页的下一个兄弟
        const activePage = document.querySelector('li[class*="pager"][class*="active"], li.active[class*="pager"]')
        const nextPage = activePage ? activePage.nextElementSibling : null
        const hasNext = nextPage && nextPage.className.includes('pager') && !nextPage.className.includes('disabled') && !nextPage.textContent.includes('下一页')
        return { headers, rows, hasMore: hasNext }
      })()
    `)

    if (!data || data.error || !data.rows?.length) break
    if (page === 0) headers = data.headers || []
    allRows.push(...data.rows)
    if (!data.hasMore) break

    // 记录当前第一行内容，用于检测翻页是否生效
    const firstRowId = allRows[allRows.length - data.rows.length]?.texts?.[0] || ''

    // 点击下一页
    await browserHost.executeScript(`
      (() => {
        const activePage = document.querySelector('li[class*="pager"][class*="active"], li.active[class*="pager"]')
        const nextPage = activePage ? activePage.nextElementSibling : null
        if (nextPage && nextPage.className.includes('pager') && !nextPage.className.includes('disabled')) {
          const link = nextPage.querySelector('a') || nextPage
          link.click()
        }
      })()
    `)
    await new Promise(r => setTimeout(r, 3000))
  }

  if (!allRows.length) return []

  const idIdx = findColumnIndex(headers, ['运行ID'])
  const vIdx = findColumnIndex(headers, ['运行结果'])
  const lIdx = findColumnIndex(headers, ['使用语言'])
  const rtIdx = findColumnIndex(headers, ['运行时间'])
  const memIdx = findColumnIndex(headers, ['使用内存'])

  return allRows.map((item: any, i: number) => {
    const c = item.texts || []
    const l = item.links || []
    return {
      platform: 'nowcoder',
      platformSubmissionId: (idIdx >= 0 && c[idIdx]) ? `nc-${c[idIdx]}` : extractStableId(l, 'nc', i),
      verdict: mapVerdict(vIdx >= 0 ? c[vIdx] : ''),
      rawVerdict: vIdx >= 0 ? c[vIdx] : '',
      language: lIdx >= 0 ? c[lIdx] : '',
      runtimeMs: rtIdx >= 0 ? parseInt(c[rtIdx]) || undefined : undefined,
      memoryKb: memIdx >= 0 ? parseInt(c[memIdx]) || undefined : undefined,
      submittedAt: new Date().toISOString(),
      sourceUrl: l.find((x: string) => x) || '',
    }
  })
}

// --- VJudge ---

async function scrapeVjudge(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const allRows: any[] = []
  let lastFirstRowKey = ''

  for (let page = 0; page < 200; page++) {
    const data = await browserHost.executeScript(`
      (() => {
        const table = document.querySelector('table')
        if (!table) return { error: 'no table' }

        // 提取表头（只取第一个文本节点，去掉下拉菜单内容）
        const headerCells = table.querySelectorAll('thead th, thead td')
        const headers = Array.from(headerCells).map(c => {
          // 取第一个直接文本节点
          const firstText = Array.from(c.childNodes).find(n => n.nodeType === 3)
          return (firstText?.textContent?.trim() || c.textContent?.trim().split('\\n')[0]?.trim() || '')
        })

        const rows = []
        for (const row of table.querySelectorAll('tbody tr')) {
          const cells = row.querySelectorAll('td')
          if (cells.length < 3) continue
          rows.push({
            texts: Array.from(cells).map(c => c.textContent.trim()),
            links: Array.from(cells).map(c => { const a = c.querySelector('a'); return a ? a.href : '' }),
            rowId: row.id || row.getAttribute('data-id') || row.getAttribute('data-runid') || ''
          })
        }

        // VJudge DataTables 翻页
        const nextBtn = document.querySelector('.dt-paging-button.page-item:not(.disabled) a, li.dt-paging-button.page-item:not(.disabled)')
        return { headers, rows, hasMore: !!nextBtn }
      })()
    `)

    if (!data || data.error || !data.rows?.length) break

    // 检测是否有新数据（对比第一行）
    const firstRowKey = data.rows[0]?.texts?.slice(0, 5)?.join('|') || ''
    if (page > 0 && firstRowKey === lastFirstRowKey) break
    lastFirstRowKey = firstRowKey

    allRows.push(...data.rows)
    if (!data.hasMore) break

    // 点击下一页
    await browserHost.executeScript(`
      (() => {
        const btn = document.querySelector('.dt-paging-button.page-item:not(.disabled) a, li.dt-paging-button.page-item:not(.disabled)')
        if (btn) btn.click()
      })()
    `)
    await new Promise(r => setTimeout(r, 2500))
  }

  if (!allRows.length) return []

  // VJudge 固定列顺序：用户名(0), OJ(1), 题号(2), _(3), 结果(4), 耗时(5), 内存(6), 代码长度(7), 语言(8), 提交时间(9)
  // 去重：用 OJ + 题号 + 结果 + 语言 + 提交时间作为唯一键
  const seen = new Set<string>()
  const results: SubmissionData[] = []

  for (let i = 0; i < allRows.length; i++) {
    const c = allRows[i].texts || []
    const l = allRows[i].links || []
    const oj = c[1] || ''
    const prob = c[2] || ''
    const verdict = c[4] || ''
    const lang = c[8] || ''
    const time = c[9] || ''

    // 用 OJ+题号+语言+时间 去重
    const key = `${oj}-${prob}-${lang}-${time}`
    if (seen.has(key)) continue
    seen.add(key)

    // 从行属性或链接中提取提交 ID
    const rowId = allRows[i].rowId || ''
    let subId = ''
    if (rowId) {
      subId = `vj-${rowId}`
    } else {
      for (const link of l) {
        if (!link) continue
        const m = link.match(/\/solution\/(\d+)/)
        if (m) { subId = `vj-${m[1]}`; break }
      }
    }
    if (!subId) subId = extractStableId(l, 'vj', i)

    results.push({
      platform: 'vjudge',
      platformSubmissionId: subId,
      verdict: mapVerdict(verdict),
      rawVerdict: verdict,
      language: lang,
      runtimeMs: c[5] ? parseInt(c[5]) || undefined : undefined,
      memoryKb: c[6] ? Math.round(parseFloat(c[6]) * 1024) || undefined : undefined,
      submittedAt: new Date().toISOString(),
      sourceUrl: l.find((x: string) => x) || '',
    })
  }

  return results
}
