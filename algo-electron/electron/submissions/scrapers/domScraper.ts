import { BrowserHost } from '../../browser/BrowserHost'
import type { SubmissionData, Verdict } from '../../shared/types'

// 通过 DOM 抓取当前页面的提交记录
export async function scrapeCurrentPage(browserHost: BrowserHost): Promise<SubmissionData[] | null> {
  const url = browserHost.getUrl()

  if (url.includes('acwing.com')) {
    return scrapeAcwing(browserHost)
  }
  if (url.includes('nowcoder.com')) {
    return scrapeNowcoder(browserHost)
  }
  if (url.includes('vjudge.net')) {
    return scrapeVjudge(browserHost)
  }

  return null
}

function mapVerdict(result: string): Verdict {
  const r = result.toUpperCase().trim()
  if (r.includes('ACCEPTED') || r === 'AC') return 'AC'
  if (r.includes('WRONG') || r === 'WA') return 'WA'
  if (r.includes('TIME LIMIT') || r === 'TLE') return 'TLE'
  if (r.includes('MEMORY LIMIT') || r === 'MLE') return 'MLE'
  if (r.includes('RUNTIME') || r === 'RE') return 'RE'
  if (r.includes('COMPILE') || r.includes('COMPILATION') || r === 'CE') return 'CE'
  if (r.includes('PRESENTATION') || r === 'PE') return 'PE'
  return 'UNKNOWN'
}

async function scrapeAcwing(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const data = await browserHost.executeScript(`
    (() => {
      const rows = document.querySelectorAll('table tbody tr, .ant-table-tbody tr, [class*="submission"] tr')
      const results = []
      for (const row of rows) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 3) continue
        const texts = Array.from(cells).map(c => c.textContent.trim())
        results.push(texts)
      }
      return { url: location.href, rowCount: rows.length, sample: results.slice(0, 5) }
    })()
  `)

  if (!data || data.rowCount === 0) return []

  // 从 URL 提取题号
  const problemMatch = data.url.match(/\/problem\/content\/(\d+)/)
  const problemId = problemMatch ? problemMatch[1] : null

  return (data.sample || []).map((cells: string[], i: number) => ({
    platform: 'acwing',
    platformSubmissionId: `ac-${Date.now()}-${i}`,
    verdict: mapVerdict(cells[1] || cells[0] || ''),
    rawVerdict: cells[1] || cells[0] || '',
    language: cells[2] || '',
    submittedAt: new Date().toISOString(),
    sourceUrl: data.url,
  }))
}

async function scrapeNowcoder(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const data = await browserHost.executeScript(`
    (() => {
      const rows = document.querySelectorAll('table tbody tr, .ant-table-tbody tr, [class*="submit"] tr, [class*="record"] tr')
      const results = []
      for (const row of rows) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 3) continue
        const texts = Array.from(cells).map(c => c.textContent.trim())
        results.push(texts)
      }
      return { url: location.href, rowCount: rows.length, sample: results.slice(0, 5) }
    })()
  `)

  if (!data || data.rowCount === 0) return []

  return (data.sample || []).map((cells: string[], i: number) => ({
    platform: 'nowcoder',
    platformSubmissionId: `nc-${Date.now()}-${i}`,
    verdict: mapVerdict(cells[1] || cells[0] || ''),
    rawVerdict: cells[1] || cells[0] || '',
    language: cells[2] || '',
    submittedAt: new Date().toISOString(),
    sourceUrl: data.url,
  }))
}

async function scrapeVjudge(browserHost: BrowserHost): Promise<SubmissionData[]> {
  const data = await browserHost.executeScript(`
    (() => {
      const rows = document.querySelectorAll('#status tbody tr, table tbody tr')
      const results = []
      for (const row of rows) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 4) continue
        const texts = Array.from(cells).map(c => c.textContent.trim())
        // 提取链接
        const links = Array.from(cells).map(c => {
          const a = c.querySelector('a')
          return a ? a.href : ''
        })
        results.push({ texts, links })
      }
      return { url: location.href, rowCount: rows.length, sample: results.slice(0, 5) }
    })()
  `)

  if (!data || data.rowCount === 0) return []

  return (data.sample || []).map((item: any, i: number) => {
    const cells = item.texts || []
    const links = item.links || []
    return {
      platform: 'vjudge',
      platformSubmissionId: `vj-${cells[0] || Date.now()}`,
      verdict: mapVerdict(cells[2] || ''),
      rawVerdict: cells[2] || '',
      language: cells[4] || '',
      submittedAt: new Date().toISOString(),
      sourceUrl: links[0] || data.url,
    }
  })
}
