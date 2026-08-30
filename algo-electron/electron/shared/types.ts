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

/**
 * 抓取器在解析页面时顺手拿到、`SubmissionData` 里没有对应字段的题目线索。
 *
 * 生命周期只有一段：抓取器写入 → `SubmissionPageContextResolver` 补全 →
 * `SubmissionProblemAttacher` 读取并换成 `problemId`。**不入库、不进 IPC、不出导出**
 * ——数据库里对应的是 `submissions.problem_id` 这一列，线索本身用完即弃。
 *
 * 下划线前缀是历史约定，保留：这些键名同时出现在已落库的 `rawJson` 载荷里
 * （见 `hydrateRawProblemId`），改名会读不到存量数据。
 */
export interface SubmissionScraperHints {
  /** 洛谷题号，如 `P1001`。 */
  _luoguProblemId?: string
  /** 洛谷题目标题，抓取列表页时一并拿到，省一次详情页请求。 */
  _luoguProblemTitle?: string
  /** PTA 的 `题集-题目` 复合号，如 `994805342720868352-994805377143986176`。 */
  _ptaProblemId?: string
  /** 牛客比赛内的题目序号，如 `A`。只有表格抓取路径能拿到。 */
  _ncProbLetter?: string
  /** 牛客比赛号；由 resolver 从 URL 解析后回填，抓取器拿不到。 */
  _ncContestId?: string
  /** vjudge 题号，如 `CodeForces-1A`。 */
  _vjudgeProblemId?: string
}

/**
 * 带线索的提交记录。线索全部可选，所以裸 `SubmissionData` 可直接赋给它，
 * 调用方不需要改动。
 */
export type ScrapedSubmission = SubmissionData & SubmissionScraperHints
