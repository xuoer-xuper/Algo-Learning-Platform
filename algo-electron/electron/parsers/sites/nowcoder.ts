import type { SiteParser } from '../types'
import type { ProblemIdentity } from '../../shared/types'

// nowcoder.com/practice/uuid
// nowcoder.com/questionTerminal/uuid
// ac.nowcoder.com/acm/problem/id
const PATTERNS = [
  { host: 'www.nowcoder.com', pattern: /^\/practice\/([a-f0-9-]+)/ },
  { host: 'www.nowcoder.com', pattern: /^\/questionTerminal\/([a-f0-9-]+)/ },
  { host: 'nowcoder.com', pattern: /^\/practice\/([a-f0-9-]+)/ },
  { host: 'nowcoder.com', pattern: /^\/questionTerminal\/([a-f0-9-]+)/ },
  { host: 'ac.nowcoder.com', pattern: /^\/acm\/problem\/(\d+)/ },
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
          const id = m[1]
          return {
            platform: 'nowcoder',
            platformProblemId: id,
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
