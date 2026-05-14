import type { SiteParser } from './types'
import type { ProblemIdentity } from '../shared/types'
import { codeforcesParser } from './sites/codeforces'
import { acwingParser } from './sites/acwing'
import { nowcoderParser } from './sites/nowcoder'
import { vjudgeParser } from './sites/vjudge'

const parsers: SiteParser[] = [
  codeforcesParser,
  acwingParser,
  nowcoderParser,
  vjudgeParser,
]

export function parseUrl(url: string): ProblemIdentity | null {
  for (const parser of parsers) {
    if (parser.match(url)) {
      return parser.parse(url)
    }
  }
  return null
}
