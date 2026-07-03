import assert from 'node:assert'
import { builtinSiteAdapters } from '../../electron/adapters/sites/index.ts'
import {
  getAdapter,
  getAdapterForUrl,
  getRealtimeAdapterForUrl,
  getRealtimeAdapterIds,
} from '../../electron/adapters/registry.ts'

const expectedBuiltinIds = [
  'codeforces',
  'acwing',
  'nowcoder',
  'vjudge',
  'pta',
  'luogu',
  'leetcode-cn',
]

assert.deepStrictEqual(
  builtinSiteAdapters.map(adapter => adapter.id),
  expectedBuiltinIds,
  'Builtin adapter list should be the single source of registration order',
)

assert.strictEqual(
  new Set(builtinSiteAdapters.map(adapter => adapter.id)).size,
  builtinSiteAdapters.length,
  'Builtin adapter ids should be unique',
)

for (const adapter of builtinSiteAdapters) {
  assert.strictEqual(
    getAdapter(adapter.id),
    adapter,
    `Registry should register builtin adapter ${adapter.id}`,
  )
}

assert.strictEqual(
  getAdapterForUrl('https://ac.nowcoder.com/acm/problem/278465')?.id,
  'nowcoder',
  'Registry should resolve adapters by builtin domains',
)

assert.strictEqual(
  getRealtimeAdapterForUrl('https://vjudge.net/contest/809557#problem/K')?.id,
  'vjudge',
  'Realtime registry lookup should use the registered site adapter',
)

assert.deepStrictEqual(
  getRealtimeAdapterIds(),
  expectedBuiltinIds,
  'All builtin adapters currently expose realtime submission monitoring',
)
