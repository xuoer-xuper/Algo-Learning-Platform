import type { ProblemIdentity, SubmissionData } from '../shared/types'
import { localDayFromTimestamp } from '../db/repositories/stats/date'
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
  updateFirstAc(problemId: string): Iterable<string> | void
  recomputeStats(dates: Iterable<string>): void
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
    const affectedDates = new Set<string>()

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
      if (isNew) {
        inserted += 1
        const submittedDay = localDayFromTimestamp(submission.submittedAt)
        if (submittedDay) affectedDates.add(submittedDay)
      }
      if (isNew && submission.verdict === 'AC' && submission.problemId) {
        const firstAcDays = this.deps.updateFirstAc(submission.problemId)
        if (firstAcDays) {
          for (const date of firstAcDays) affectedDates.add(date)
        }
      }
    }

    if (inserted > 0) {
      try { this.deps.recomputeStats(affectedDates) } catch { /* ignore */ }
    }

    return { platform, fetched: submissions.length, inserted }
  }
}
