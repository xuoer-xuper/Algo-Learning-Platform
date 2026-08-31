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

/**
 * `user.info` 返回的用户对象。`rating` 与 `maxRating` 声明为可选不是保守——CF 对未参加
 * 过 rated 比赛的账号根本不返回这两个字段，下面的 `?? 0` 正是为这种账号准备的。
 *
 * 注意这是对外部响应的断言而非校验：字段真的缺失或类型不符时不会在这里报错。
 */
interface CFUserInfoResponse {
  status: string
  result?: Array<{ handle: string; rating?: number; maxRating?: number }>
}

// 获取 CF 用户当前 Rating
export async function fetchCFCurrentRating(handle: string): Promise<CFUserInfo | null> {
  const url = `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`CF API error: ${resp.status}`)
  const json = await resp.json() as CFUserInfoResponse
  const user = json.result?.[0]
  if (json.status !== 'OK' || !user) return null
  return { handle: user.handle, rating: user.rating ?? 0, maxRating: user.maxRating ?? 0 }
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
