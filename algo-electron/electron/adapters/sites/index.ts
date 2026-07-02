import type { SiteAdapter } from '../types'
import { acwingAdapter } from './acwing'
import { codeforcesAdapter } from './codeforces'
import { leetcodeAdapter } from './leetcode'
import { luoguAdapter } from './luogu'
import { nowcoderAdapter } from './nowcoder'
import { ptaAdapter } from './pta'
import { vjudgeAdapter } from './vjudge'

export {
  acwingAdapter,
  codeforcesAdapter,
  leetcodeAdapter,
  luoguAdapter,
  nowcoderAdapter,
  ptaAdapter,
  vjudgeAdapter,
}

export const builtinSiteAdapters: SiteAdapter[] = [
  codeforcesAdapter,
  acwingAdapter,
  nowcoderAdapter,
  vjudgeAdapter,
  ptaAdapter,
  luoguAdapter,
  leetcodeAdapter,
]
