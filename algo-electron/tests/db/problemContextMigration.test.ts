import assert from 'node:assert'
import { inferProblemContext } from '../../electron/db/migrations/017_backfill_problem_context.ts'

assert.deepStrictEqual(
  inferProblemContext('codeforces', '2224E'),
  { contestId: '2224', problemIndex: 'E' },
)
assert.deepStrictEqual(
  inferProblemContext('codeforces', '1900A2'),
  { contestId: '1900', problemIndex: 'A2' },
)
assert.deepStrictEqual(
  inferProblemContext('nowcoder', 'contest-132048-A'),
  { contestId: '132048', problemIndex: 'A' },
)
assert.deepStrictEqual(
  inferProblemContext('vjudge', 'contest-809557-K'),
  { contestId: '809557', problemIndex: 'K' },
)
assert.deepStrictEqual(
  inferProblemContext('pta', '994805260223102976-1478636081501847552'),
  { contestId: '994805260223102976', problemIndex: '1478636081501847552' },
)
assert.strictEqual(inferProblemContext('luogu', 'P1001'), null)
