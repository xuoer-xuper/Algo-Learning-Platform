import type { SubmissionData } from '../shared/types'

export function pickFinalRealtimeSubmission(submissions: SubmissionData[]): SubmissionData | null {
  return submissions.find(submission => submission.verdict !== 'TESTING' && submission.verdict !== 'UNKNOWN') ?? null
}
