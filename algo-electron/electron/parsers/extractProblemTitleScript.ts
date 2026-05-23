/**
 * 在 WebContentsView 内执行的题目标题抓取脚本。
 * 选择器参考 Competitive Companion 与各站实际 DOM。
 */
export const EXTRACT_PROBLEM_TITLE_SCRIPT = `
(() => {
  const clean = (text) => (text || '').replace(/\\s+/g, ' ').trim()

  const isBad = (text) => {
    const t = clean(text)
    if (!t || t.length < 2 || t.length > 200) return true
    if (/^(ACM|OI|IOI|CSP)模式$/i.test(t)) return true
    if (/^\\d+$/.test(t)) return true
    if (/^(题目|Problem)\\s*\\d*$/i.test(t)) return true
    if (/^标题$/.test(t)) return true
    if (/程序设计类实验辅助教学平台/.test(t)) return true
    if (/^PTA$/i.test(t)) return true
    if (/^contest-\\d+-[A-Za-z0-9]+$/.test(t)) return true
    return false
  }

  const pick = (...values) => {
    for (const v of values) {
      const t = clean(typeof v === 'string' ? v : v)
      if (!isBad(t)) return t
    }
    return null
  }

  const normalizeAcwing = (raw) => {
    let t = clean(raw)
    const numbered = t.match(/^\\d+\\.\\s*(.+)$/)
    if (numbered) t = numbered[1]
    const parts = t.split('. ')
    if (parts.length > 1 && /^\\d+$/.test(parts[0])) {
      t = parts.slice(1).join('. ')
    }
    return t
  }

  const host = location.hostname

  if (host.includes('codeforces.com')) {
    const el = document.querySelector('.problemindexholder .title, div.title')
    return pick(el && el.textContent)
  }

  if (host.includes('acwing.com')) {
    const contentTitle = document.querySelector('.problem-content-title')
    if (contentTitle) {
      return pick(normalizeAcwing(contentTitle.textContent))
    }
    return null
  }

  if (host.includes('nowcoder.com')) {
    if (host === 'ac.nowcoder.com') {
      const terminal = document.querySelector('.terminal-topic-title')
      if (terminal) return pick(terminal.textContent)
      const pat = document.querySelector('.pat-content h3')
      if (pat) return pick(pat.textContent.split(' (')[0])
    }

    const practiceTitle = document.querySelector(
      '.question-title, .subject-title, .module-title, .nc-title, [class*="QuestionTitle"]'
    )
    if (practiceTitle) return pick(practiceTitle.textContent)

    const mainHeading = document.querySelector(
      '.subject-main h3, .question-description h1, .question-content h1'
    )
    if (mainHeading) return pick(mainHeading.textContent)

    const docTitle = document.title.split(/[-_|]/)[0]
    return pick(docTitle)
  }

  if (host.includes('pintia.cn')) {
    const isSectionTitle = (text) => {
      const t = clean(text)
      if (/^(输入|输出)(格式|样例|说明)?[：:]?$/.test(t)) return true
      if (/^(Input|Output)(\s+(Format|Specification|Sample))?[：:]?$/i.test(t)) return true
      if (/^(样例|Sample)[\s]*[：:]?$/i.test(t)) return true
      if (/^(题目|限制|提示|注意|范围|Supplement|Constraint|Hint|Note|Limit|Range)[：:]?$/.test(t)) return true
      return false
    }

    const stripPtaPrefix = (text) => {
      let t = clean(text)
      const m = t.match(/^[A-Z][0-9]+-[0-9]+\\s+(.+)$/)
      if (m) return m[1]
      const m2 = t.match(/^[0-9]+\\s+(.+)$/)
      if (m2) return m2[1]
      return t
    }

    let docTitle = document.title
    docTitle = docTitle.replace(/\\s*\\|\\s*[^|]*$/, '')
    docTitle = docTitle.replace(/\\s*[–—]\\s*[^–—]*$/, '')
    docTitle = docTitle.replace(/\\s+-\\s+.*$/, '')
    docTitle = docTitle.trim()
    if (docTitle && !isBad(docTitle) && !isSectionTitle(docTitle)) return pick(stripPtaPrefix(docTitle))

    const problemTitle = document.querySelector('[class*="problem-title"], [class*="ProblemTitle"], .problem-detail-title')
    if (problemTitle && !isSectionTitle(problemTitle.textContent)) return pick(stripPtaPrefix(problemTitle.textContent))

    const headings = document.querySelectorAll('h2, h3, h1')
    for (const h of headings) {
      const t = clean(h.textContent)
      if (t && !isBad(t) && !isSectionTitle(t)) return pick(stripPtaPrefix(t))
    }

    return null
  }

  if (host.includes('vjudge.net')) {
    const isContestName = (text) => {
      const t = clean(text)
      if (/Contest/i.test(t) && t.length > 30) return true
      if (/Invitational|Regional|Preliminary|Quarterfinal|Semifinal|Final|Qualification|Provincial|Collegiate/i.test(t)) return true
      if (/CCPC|ICPC|NCPC|ECPC|SCPC|WCPC/i.test(t) && t.length > 20) return true
      return false
    }

    const stripVjPrefix = (text) => {
      let t = clean(text)
      const m = t.match(/^[A-Z][0-9]?\\s*-\\s*(.+)$/)
      if (m) return m[1]
      const m2 = t.match(/^([A-Z])[0-9]?\\s*\\.\\s*(.+)$/)
      if (m2) return m2[2]
      return t
    }

    const isOnContestPage = /\\/contest\\//.test(location.pathname)
    if (isOnContestPage) {
      const hash = location.hash || ''
      const letterMatch = hash.match(/#problem\\/([A-Za-z0-9]+)/)
      const currentLetter = letterMatch ? letterMatch[1] : ''

      if (currentLetter) {
        const probLinks = document.querySelectorAll('a[href*="#problem/"]')
        for (const link of probLinks) {
          const href = link.getAttribute('href') || ''
          if (href.endsWith('#problem/' + currentLetter)) {
            const linkText = clean(link.textContent)
            if (linkText && !isBad(linkText)) return pick(stripVjPrefix(linkText))
          }
        }

        const tableRows = document.querySelectorAll('table tbody tr, .problem-list tr, [class*="problem"] tr')
        for (const row of tableRows) {
          const rowText = clean(row.textContent)
          if (rowText && rowText.includes(currentLetter)) {
            const cells = row.querySelectorAll('td')
            for (const cell of cells) {
              const cellText = clean(cell.textContent)
              if (cellText && !isBad(cellText) && cellText.length > currentLetter.length) {
                return pick(stripVjPrefix(cellText))
              }
            }
          }
        }
      }

      const activeProb = document.querySelector('.active .prob-title, .active .problem-title, [class*="active"] [class*="prob-title"], [class*="active"] [class*="problem-title"], .section--problem-header h2')
      if (activeProb) return pick(stripVjPrefix(activeProb.textContent))
    }

    const headerTitle = document.querySelector('.problem-header h2, .section--problem-header h2, h2.title')
    if (headerTitle) return pick(stripVjPrefix(headerTitle.textContent))

    const genericTitle = document.querySelector('.prob-title, .problem-title, [class*="prob-title"], [class*="problem-title"]')
    if (genericTitle && !genericTitle.closest('th, thead')) return pick(stripVjPrefix(genericTitle.textContent))

    const probNav = document.querySelector('.problem-nav-title, .nav-problem .title, [class*="problem-nav"] .title')
    if (probNav) return pick(stripVjPrefix(probNav.textContent))

    const iframe = document.querySelector('iframe[src*="problem"]')
    if (iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
        if (iframeDoc) {
          const iframeTitle = iframeDoc.querySelector('h1, h2, .title')
          if (iframeTitle) return pick(stripVjPrefix(iframeTitle.textContent))
        }
      } catch { /* cross-origin */ }
    }

    const docTitle = document.title.replace(/\\s*[-–—|]\\s*Virtual Judge\\s*$/i, '').trim()
    if (docTitle && !isBad(docTitle) && !isContestName(docTitle)) return pick(stripVjPrefix(docTitle))

    return null
  }

  return null
})()
`
