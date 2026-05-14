import type { SiteParser } from '../types'
import type { ProblemIdentity } from '../../shared/types'

// nowcoder.com/practice/uuid
// nowcoder.com/questionTerminal/uuid
// ac.nowcoder.com/acm/problem/id
// ac.nowcoder.com/acm/contest/132048/A
const PATTERNS = [
  { host: 'www.nowcoder.com', pattern: /^\/practice\/([a-f0-9-]+)/ },
  { host: 'www.nowcoder.com', pattern: /^\/questionTerminal\/([a-f0-9-]+)/ },
  { host: 'nowcoder.com', pattern: /^\/practice\/([a-f0-9-]+)/ },
  { host: 'nowcoder.com', pattern: /^\/questionTerminal\/([a-f0-9-]+)/ },
  { host: 'ac.nowcoder.com', pattern: /^\/acm\/problem\/(\d+)/ },
  { host: 'ac.nowcoder.com', pattern: /^\/acm\/contest\/(\d+)\/([A-Za-z]\d*)/ },
]

export const nowcoderParser: SiteParser = {
  siteId: 'nowcoder',

  match(url: string): boolean {
    try {
      const u = new URL(url)
      return ['www.nowcoder.com', 'nowcoder.com', 'ac.nowcoder.com'].includes(u.hostname)
    } catch {
      return false
    }
  },

  parse(url: string): ProblemIdentity | null {
    try {
      const u = new URL(url)
      for (const { host, pattern } of PATTERNS) {
        if (u.hostname !== host) continue
        const m = u.pathname.match(pattern)
        if (m) {
          if (m.length === 3) {
            // contest 格式: /acm/contest/{contestId}/{index}
            const contestId = m[1]
            const index = m[2]
            return {
              platform: 'nowcoder',
              platformProblemId: `contest-${contestId}-${index}`,
              canonicalUrl: u.origin + u.pathname,
              contestId,
              problemIndex: index,
              confidence: 'url',
            }
          }
          return {
            platform: 'nowcoder',
            platformProblemId: m[1],
            canonicalUrl: u.origin + u.pathname,
            confidence: 'url',
          }
        }
      }
    } catch {
      // invalid URL
    }
    return null
  },
}
