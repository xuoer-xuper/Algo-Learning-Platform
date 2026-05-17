/** 判断是否为明显错误的自动抓取标题（应允许重新覆盖） */
export function isBadScrapedTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return true
  const t = title.trim()
  if (t.length < 2) return true
  if (/^(ACM|OI|IOI|CSP)模式$/i.test(t)) return true
  if (/^\d+$/.test(t)) return true
  if (/^(题目|Problem)\s*\d*$/i.test(t)) return true
  return false
}

export function isValidScrapedTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false
  const t = title.trim()
  if (t.length > 200) return false
  return !isBadScrapedTitle(t)
}
