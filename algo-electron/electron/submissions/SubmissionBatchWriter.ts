import type { ProblemIdentity, SubmissionData } from '../shared/types'
import { SubmissionProblemAttacher } from './SubmissionProblemAttacher'

export interface SubmissionBatchWriteResult {
  platform: string
  fetched: number
  inserted: number
}

export interface SubmissionBatchWriteOptions {
  platform: string
  submissions: SubmissionData[]
  pageProblemId?: string
  pageProblemIdentity?: ProblemIdentity | null
  currentUrl?: string
}

export interface SubmissionBatchWriterDeps {
  upsertProblem(identity: ProblemIdentity): void
  findProblemId(platform: string, platformProblemId: string): string | undefined
  upsertSubmission(submission: SubmissionData): boolean
  updateFirstAc(problemId: string): void
  recomputeStats(): void
  parseUrl(url: string): ProblemIdentity | null
  buildCodeforcesProblemUrl(contestId: string | number, index: string): string
}

export class SubmissionBatchWriter {
  private readonly problemAttacher: SubmissionProblemAttacher

  constructor(private readonly deps: SubmissionBatchWriterDeps) {
    this.problemAttacher = new SubmissionProblemAttacher(deps)
  }

  write(options: SubmissionBatchWriteOptions): SubmissionBatchWriteResult {
    const { platform, submissions, pageProblemId, pageProblemIdentity, currentUrl } = options
    let inserted = 0

    let pageProblemDbId: string | undefined
    if (pageProblemIdentity) {
      this.deps.upsertProblem(pageProblemIdentity)
    }
    if (pageProblemId) {
      pageProblemDbId = this.problemAttacher.ensureProblem({
        platform,
        platformProblemId: pageProblemId,
        canonicalUrl: pageProblemIdentity?.canonicalUrl ?? currentUrl ?? '',
        title: pageProblemIdentity?.title,
        contestId: pageProblemIdentity?.contestId,
        problemIndex: pageProblemIdentity?.problemIndex,
        sourcePlatform: pageProblemIdentity?.sourcePlatform,
        sourceProblemId: pageProblemIdentity?.sourceProblemId,
        confidence: pageProblemIdentity?.confidence ?? 'url',
      })
    }

    for (const submission of submissions) {
      this.problemAttacher.attachProblem(submission, platform, pageProblemDbId)

      const isNew = this.deps.upsertSubmission(submission)
      if (isNew) inserted += 1
      if (isNew && submission.verdict === 'AC' && submission.problemId) {
        this.deps.updateFirstAc(submission.problemId)
      }
    }

    if (inserted > 0) {
      try { this.deps.recomputeStats() } catch { /* ignore */ }
    }

    return { platform, fetched: submissions.length, inserted }
  }
}
