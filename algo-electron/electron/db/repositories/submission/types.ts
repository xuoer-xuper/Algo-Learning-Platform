import type { submissions } from '../../../../src/main/db/schema'

export type SubmissionRow = Omit<
  typeof submissions.$inferSelect,
  'submitted_at' | 'created_at' | 'updated_at' | 'deleted_at'
> & {
  submitted_at: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export type ProblemFirstAcRow = Pick<SubmissionRow, 'problem_id'> & { first_ac_at: number }

export interface FirstAcRow {
  submitted_at: number
}
