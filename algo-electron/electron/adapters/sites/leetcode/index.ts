import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import type { SiteAdapter, SubmissionDetectionPayload } from '../../types'
import { createLeetcodeRealtimeHookScript } from './hook'
import {
  matchLeetcodeProblem,
  matchLeetcodeSubmissionResult,
  parseLeetcodeProblem,
} from './problem'
import { parseLeetcodeSubmissionResult, resolveLeetcodeProblemIdentity } from './submissions'

export const leetcodeAdapter: SiteAdapter = {
  id: 'leetcode-cn',
  name: 'LeetCode.cn',
  domains: ['leetcode.cn', 'www.leetcode.cn'],
  homeUrl: 'https://leetcode.cn/problemset/',
  isSpa: true,

  matchProblem(url: string): boolean {
    return matchLeetcodeProblem(url)
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseLeetcodeProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    return matchLeetcodeSubmissionResult(url)
  },

  injectHookScript(): string {
    return createLeetcodeRealtimeHookScript()
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    return parseLeetcodeSubmissionResult(raw)
  },

  resolveProblemIdentity(_submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    return resolveLeetcodeProblemIdentity(raw)
  },
}
