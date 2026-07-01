// 统一题目标识
export interface ProblemIdentity {
  platform: string
  platformProblemId: string
  canonicalUrl: string
  title?: string
  contestId?: string
  problemIndex?: string
  sourcePlatform?: string
  sourceProblemId?: string
  confidence: 'url' | 'content' | 'manual'
}

// 统一提交结果
export type Verdict =
  | 'AC'
  | 'WA'
  | 'TLE'
  | 'MLE'
  | 'RE'
  | 'CE'
  | 'PE'
  | 'OLE'
  | 'SKIPPED'
  | 'TESTING'
  | 'UNKNOWN'

export interface SubmissionData {
  platform: string
  platformSubmissionId: string
  problemId?: string
  verdict: Verdict
  rawVerdict?: string
  language?: string
  submittedAt: string
  runtimeMs?: number
  memoryKb?: number
  sourceUrl?: string
  rawJson?: string
}
