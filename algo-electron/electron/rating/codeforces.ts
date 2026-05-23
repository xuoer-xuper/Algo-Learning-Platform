import { toBeijing } from '../shared/time'

interface CFUserInfo {
  handle: string
  rating: number
  maxRating: number
}

interface CFRatingChange {
  contestId: number
  contestName: string
  rank: number
  oldRating: number
  newRating: number
  ratingUpdateTimeSeconds: number
}

// 获取 CF 用户当前 Rating
export async function fetchCFCurrentRating(handle: string): Promise<CFUserInfo | null> {
  const url = `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`CF API error: ${resp.status}`)
  const json = await resp.json() as { status: string; result: any[] }
  if (json.status !== 'OK' || !json.result?.length) return null
  const u = json.result[0]
  return { handle: u.handle, rating: u.rating ?? 0, maxRating: u.maxRating ?? 0 }
}

// 获取 CF 用户 Rating 历史
export async function fetchCFRatingHistory(handle: string): Promise<CFRatingChange[]> {
  const url = `https://codeforces.com/api/user.rating?handle=${encodeURIComponent(handle)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`CF API error: ${resp.status}`)
  const json = await resp.json() as { status: string; result: CFRatingChange[] }
  if (json.status !== 'OK') throw new Error('CF API returned non-OK status')
  return json.result
}

// 格式化 CF rating history 为统一格式
export function formatCFRatingHistory(history: CFRatingChange[]) {
  return history.map(h => ({
    contestId: String(h.contestId),
    contestName: h.contestName,
    rank: h.rank,
    ratingBefore: h.oldRating,
    ratingAfter: h.newRating,
    delta: h.newRating - h.oldRating,
    contestAt: toBeijing(new Date(h.ratingUpdateTimeSeconds * 1000)),
    rawJson: JSON.stringify(h),
  }))
}
