import { getDb } from '../db/connection'
import { upsertProblem } from '../db/repositories/problemRepository'
import { recomputeAllDailyStats } from '../db/repositories/statsRepository'
import { upsertSubmission, updateFirstAc } from '../db/repositories/submissionRepository'
import { parseUrl } from '../parsers/registry'
import { buildCodeforcesProblemUrlFromApi } from '../adapters/codeforcesUrls'
import { SubmissionBatchWriter } from './SubmissionBatchWriter'

export function createDefaultSubmissionBatchWriter(): SubmissionBatchWriter {
  return new SubmissionBatchWriter({
    upsertProblem,
    findProblemId: (platform, platformProblemId) => {
      const problem = getDb().prepare(
        'SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?'
      ).get(platform, platformProblemId) as { id: string } | undefined
      return problem?.id
    },
    upsertSubmission,
    updateFirstAc,
    recomputeStats: recomputeAllDailyStats,
    parseUrl,
    buildCodeforcesProblemUrl: buildCodeforcesProblemUrlFromApi,
  })
}
