import type { ProblemRecord } from '@shared/types/problem'

/**
 * 首页"最近题目"卡片只读 ProblemRecord 的展示字段（不需要 submission_count）。
 * 收口前这里是整份手抄副本（阶段 2 R2 删除，改为 Pick 单一来源）。
 */
export type HomeProblemRecord = Pick<
  ProblemRecord,
  | 'id'
  | 'platform'
  | 'platform_problem_id'
  | 'canonical_url'
  | 'title'
  | 'status'
  | 'last_visited_at'
>
