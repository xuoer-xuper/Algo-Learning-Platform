/** 判断是否为明显错误的自动抓取标题（应允许重新覆盖） */
export function isBadScrapedTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return true
  const t = title.trim()
  if (t.length < 2) return true
  if (/^(ACM|OI|IOI|CSP)模式$/i.test(t)) return true
  if (/^\d+$/.test(t)) return true
  if (/^(题目|Problem)\s*\d*$/i.test(t)) return true
  if (/^(题目|Problem)\s*[-–—:：|]\s*[A-Za-z]\d*$/i.test(t)) return true
  if (/^(提交详情|Submission Detail|Submissions?|Loading|加载中|请稍候|Just a moment)\.?\s*$/i.test(t)) return true
  if (/^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i.test(t)) return true
  return false
}

export function isValidScrapedTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false
  const t = title.trim()
  if (t.length > 200) return false
  return !isBadScrapedTitle(t)
}

export function hasCjkText(title: string | null | undefined): boolean {
  return Boolean(title && /[\u3400-\u9fff]/.test(title))
}

export function shouldReplaceScrapedTitle(existing: string | null | undefined, incoming: string | null | undefined): boolean {
  if (!isValidScrapedTitle(incoming)) return false
  if (!existing?.trim()) return true
  if (isBadScrapedTitle(existing)) return true
  return hasCjkText(incoming) && !hasCjkText(existing)
}
