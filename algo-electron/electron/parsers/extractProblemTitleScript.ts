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

  return null
})()
`
