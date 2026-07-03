import type { ProblemIdentity, SubmissionData } from '../shared/types'

export interface SubmissionProblemAttachmentDeps {
  upsertProblem(identity: ProblemIdentity): void
  findProblemId(platform: string, platformProblemId: string): string | undefined
  parseUrl(url: string): ProblemIdentity | null
  buildCodeforcesProblemUrl(contestId: string | number, index: string): string
}

export class SubmissionProblemAttacher {
  constructor(private readonly deps: SubmissionProblemAttachmentDeps) {}

  attachProblem(submission: SubmissionData, platform: string, pageProblemDbId?: string): void {
    if (pageProblemDbId) {
      submission.problemId = pageProblemDbId
    }

    if (platform === 'codeforces') {
      if (!submission.problemId) {
        this.attachCodeforcesProblem(submission)
      }
      return
    }

    if (!submission.problemId) {
      this.attachProblemFromRawLinks(submission)
    }

    if (!submission.problemId && submission.platform === 'pta') {
      this.attachPtaProblem(submission)
    }

    if (!submission.problemId && submission.platform === 'luogu') {
      this.attachLuoguProblem(submission)
    }

    if (!submission.problemId && submission.platform === 'nowcoder') {
      this.attachNowcoderProblem(submission)
    }

    if (!submission.problemId && submission.platform === 'vjudge') {
      this.attachVjudgeProblem(submission)
    }

    if (!submission.problemId && submission.platform === 'pta' && submission.sourceUrl) {
      this.attachProblemFromSourceUrl(submission, 'pta')
    }
  }

  ensureProblem(identity: ProblemIdentity): string | undefined {
    let problemId = this.deps.findProblemId(identity.platform, identity.platformProblemId)
    if (problemId) return problemId

    this.deps.upsertProblem(identity)
    problemId = this.deps.findProblemId(identity.platform, identity.platformProblemId)
    return problemId
  }

  private attachCodeforcesProblem(submission: SubmissionData): void {
    try {
      const raw = JSON.parse(submission.rawJson || '{}')
      if (raw.problem?.contestId && raw.problem?.index) {
        const contestId = raw.problem.contestId
        const problemIndex = String(raw.problem.index)
        const platformProblemId = `${contestId}${problemIndex}`
        submission.problemId = this.ensureProblem({
          platform: 'codeforces',
          platformProblemId,
          canonicalUrl: this.deps.buildCodeforcesProblemUrl(contestId, problemIndex),
          contestId: String(contestId),
          problemIndex,
          confidence: 'url',
        })
        return
      }
    } catch {
      // Fall through to table-link parsing.
    }

    try {
      const raw = JSON.parse(submission.rawJson || '{}')
      const links = Array.isArray(raw.row?.links) ? raw.row.links : []
      for (const link of links) {
        if (typeof link !== 'string' || !link) continue
        const identity = this.deps.parseUrl(link)
        if (identity?.platform !== 'codeforces') continue
        this.deps.upsertProblem(identity)
        submission.problemId = this.deps.findProblemId(identity.platform, identity.platformProblemId)
        if (submission.problemId) return
      }
    } catch {
      // Ignore malformed rawJson; unresolved submissions can still be stored without problemId.
    }
  }

  private attachPtaProblem(submission: SubmissionData): void {
    const ptaProblemId = (submission as any)._ptaProblemId
    if (!ptaProblemId) return

    const parts = String(ptaProblemId).split('-')
    submission.problemId = this.ensureProblem({
      platform: 'pta',
      platformProblemId: ptaProblemId,
      canonicalUrl: parts.length >= 2
        ? `https://pintia.cn/problem-sets/${parts[0]}/exam/problems/type/7?problemSetProblemId=${parts[1]}`
        : `https://pintia.cn/problem-sets/${ptaProblemId}`,
      contestId: parts[0],
      problemIndex: parts.length >= 2 ? parts[1] : undefined,
      confidence: 'url',
    })
  }

  private attachLuoguProblem(submission: SubmissionData): void {
    const rawInfo = this.parseLuoguRawProblemInfo(submission)
    const luoguProblemId = (submission as any)._luoguProblemId ?? rawInfo.problemId
    if (!luoguProblemId) return

    submission.problemId = this.ensureProblem({
      platform: 'luogu',
      platformProblemId: luoguProblemId,
      canonicalUrl: `https://www.luogu.com.cn/problem/${luoguProblemId}`,
      title: (submission as any)._luoguProblemTitle ?? rawInfo.title,
      confidence: 'url',
    })
  }

  private attachNowcoderProblem(submission: SubmissionData): void {
    const contestId = (submission as any)._ncContestId
    const problemLetter = (submission as any)._ncProbLetter
    if (!contestId || !problemLetter) return

    const problemIndex = String(problemLetter).trim()
    if (!problemIndex) return

    submission.problemId = this.ensureProblem({
      platform: 'nowcoder',
      platformProblemId: `contest-${contestId}-${problemIndex}`,
      canonicalUrl: `https://ac.nowcoder.com/acm/contest/${contestId}/${problemIndex}`,
      contestId: String(contestId),
      problemIndex,
      confidence: 'url',
    })
  }

  private attachVjudgeProblem(submission: SubmissionData): void {
    const rawInfo = this.parseVjudgeRawProblemInfo(submission)
    const vjudgeProblemId = (submission as any)._vjudgeProblemId ?? rawInfo.problemId
    if (!vjudgeProblemId) return

    submission.problemId = this.ensureProblem({
      platform: 'vjudge',
      platformProblemId: vjudgeProblemId,
      canonicalUrl: `https://vjudge.net/problem/${vjudgeProblemId}`,
      sourcePlatform: rawInfo.sourcePlatform,
      sourceProblemId: rawInfo.sourceProblemId,
      confidence: 'url',
    })
  }

  private parseVjudgeRawProblemInfo(submission: SubmissionData): {
    problemId?: string
    sourcePlatform?: string
    sourceProblemId?: string
  } {
    try {
      const raw = JSON.parse(submission.rawJson || '{}')
      return {
        problemId: typeof raw?._vjudgeProblemId === 'string' && raw._vjudgeProblemId.trim()
          ? raw._vjudgeProblemId.trim()
          : undefined,
        sourcePlatform: typeof raw?._vjudgeSourcePlatform === 'string' && raw._vjudgeSourcePlatform.trim()
          ? raw._vjudgeSourcePlatform.trim()
          : undefined,
        sourceProblemId: typeof raw?._vjudgeSourceProblemId === 'string' && raw._vjudgeSourceProblemId.trim()
          ? raw._vjudgeSourceProblemId.trim()
          : undefined,
      }
    } catch {
      return {}
    }
  }

  private parseLuoguRawProblemInfo(submission: SubmissionData): { problemId?: string; title?: string } {
    try {
      const raw = JSON.parse(submission.rawJson || '{}')
      return {
        problemId: typeof raw?._luoguProblemId === 'string' && raw._luoguProblemId.trim()
          ? raw._luoguProblemId.trim()
          : undefined,
        title: typeof raw?._luoguProblemTitle === 'string' && raw._luoguProblemTitle.trim()
          ? raw._luoguProblemTitle.trim()
          : undefined,
      }
    } catch {
      return {}
    }
  }

  private attachProblemFromSourceUrl(submission: SubmissionData, platform: string): void {
    try {
      const sourceIdentity = this.deps.parseUrl(submission.sourceUrl!)
      if (!sourceIdentity) return

      this.deps.upsertProblem(sourceIdentity)
      submission.problemId = this.deps.findProblemId(platform, sourceIdentity.platformProblemId)
    } catch {
      // Ignore invalid sourceUrl.
    }
  }

  private attachProblemFromRawLinks(submission: SubmissionData): void {
    try {
      const raw = JSON.parse(submission.rawJson || '{}')
      const rowLinks = Array.isArray(raw.row?.links) ? raw.row.links : []
      const links = [
        ...rowLinks,
        submission.sourceUrl,
      ].filter((link): link is string => typeof link === 'string' && link.length > 0)

      for (const link of links) {
        const identity = this.deps.parseUrl(link)
        if (!identity || identity.platform !== submission.platform) continue
        this.deps.upsertProblem(identity)
        submission.problemId = this.deps.findProblemId(identity.platform, identity.platformProblemId)
        if (submission.problemId) return
      }
    } catch {
      // Ignore malformed rawJson; site-specific attachment may still resolve the problem.
    }
  }
}
